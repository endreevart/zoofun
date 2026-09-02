using System;
using System.Collections.Generic;

namespace VirtualZoo.Domain
{
    public sealed class FrameTimeSampler
    {
        public const float DefaultWarmupSeconds = 5f;

        readonly float _warmupSeconds;
        readonly List<float> _frameMs = new List<float>(16384);

        bool _begun;
        float _startRealtime;
        float _elapsedRealtime;
        int _totalFrames;
        float _minFps = float.MaxValue;
        float _maxFps;
        double _fpsSum;
        double _below30Seconds;
        double _currentBelow30Streak;
        double _longestBelow30Streak;
        long _memoryStart;
        long _memoryEnd;
        bool _finished;
        FrameSamplerReport _report;

        public FrameTimeSampler(float warmupSeconds = DefaultWarmupSeconds)
        {
            _warmupSeconds = Math.Max(0f, warmupSeconds);
        }

        public float ElapsedSeconds => _elapsedRealtime;
        public int TotalGameplayFrames => _totalFrames;
        public int SampleCount => _frameMs.Count;
        public bool Begun => _begun;

        public void Begin(long memoryBytes, float realtimeNow)
        {
            _begun = true;
            _finished = false;
            _startRealtime = realtimeNow;
            _elapsedRealtime = 0f;
            _totalFrames = 0;
            _frameMs.Clear();
            _minFps = float.MaxValue;
            _maxFps = 0f;
            _fpsSum = 0;
            _below30Seconds = 0;
            _currentBelow30Streak = 0;
            _longestBelow30Streak = 0;
            _memoryStart = memoryBytes;
            _memoryEnd = memoryBytes;
        }

        public void SampleFrame(float realtimeNow, float unscaledDeltaTime, long memoryBytes)
        {
            if (!_begun || _finished)
            {
                return;
            }

            _totalFrames++;
            _elapsedRealtime = Math.Max(0f, realtimeNow - _startRealtime);
            _memoryEnd = memoryBytes;

            if (_elapsedRealtime <= _warmupSeconds)
            {
                return;
            }

            if (unscaledDeltaTime <= 0f)
            {
                return;
            }

            float fps = 1f / unscaledDeltaTime;
            float ms = unscaledDeltaTime * 1000f;
            _frameMs.Add(ms);
            if (fps < _minFps)
            {
                _minFps = fps;
            }

            if (fps > _maxFps)
            {
                _maxFps = fps;
            }

            _fpsSum += fps;
            if (fps < 30f)
            {
                _below30Seconds += unscaledDeltaTime;
                _currentBelow30Streak += unscaledDeltaTime;
                if (_currentBelow30Streak > _longestBelow30Streak)
                {
                    _longestBelow30Streak = _currentBelow30Streak;
                }
            }
            else
            {
                _currentBelow30Streak = 0;
            }
        }

        public FrameSamplerReport Finish()
        {
            if (_finished)
            {
                return _report;
            }

            _finished = true;
            int samples = _frameMs.Count;
            float avg = samples > 0 ? (float)(_fpsSum / samples) : 0f;
            float minFps = samples > 0 ? _minFps : 0f;
            float maxFrame = 0f;
            for (int i = 0; i < samples; i++)
            {
                if (_frameMs[i] > maxFrame)
                {
                    maxFrame = _frameMs[i];
                }
            }

            double below = Math.Min(_below30Seconds, _elapsedRealtime);
            if (below < 0)
            {
                below = 0;
            }

            _report = new FrameSamplerReport(
                _elapsedRealtime,
                _warmupSeconds,
                _totalFrames,
                samples,
                avg,
                minFps,
                _maxFps,
                Percentile(0.50f),
                Percentile(0.95f),
                Percentile(0.99f),
                maxFrame,
                (float)below,
                (float)Math.Min(_longestBelow30Streak, _elapsedRealtime),
                _memoryStart,
                _memoryEnd);
            return _report;
        }

        float Percentile(float p)
        {
            int n = _frameMs.Count;
            if (n == 0)
            {
                return 0f;
            }

            var copy = _frameMs.ToArray();
            Array.Sort(copy);
            float index = p * (n - 1);
            int lo = (int)Math.Floor(index);
            int hi = (int)Math.Ceiling(index);
            if (lo == hi)
            {
                return copy[lo];
            }

            float t = index - lo;
            return copy[lo] + (copy[hi] - copy[lo]) * t;
        }
    }

    public readonly struct FrameSamplerReport
    {
        public FrameSamplerReport(
            float soakSeconds,
            float warmupSeconds,
            int totalGameplayFrames,
            int sampleCount,
            float fpsAverage,
            float fpsMin,
            float fpsMax,
            float frameMsP50,
            float frameMsP95,
            float frameMsP99,
            float frameMsMax,
            float secondsBelow30Fps,
            float longestBelow30StreakSeconds,
            long memoryBytesStart,
            long memoryBytesEnd)
        {
            SoakSeconds = soakSeconds;
            WarmupSeconds = warmupSeconds;
            TotalGameplayFrames = totalGameplayFrames;
            SampleCount = sampleCount;
            FpsAverage = fpsAverage;
            FpsMin = fpsMin;
            FpsMax = fpsMax;
            FrameMsP50 = frameMsP50;
            FrameMsP95 = frameMsP95;
            FrameMsP99 = frameMsP99;
            FrameMsMax = frameMsMax;
            SecondsBelow30Fps = secondsBelow30Fps;
            LongestBelow30StreakSeconds = longestBelow30StreakSeconds;
            MemoryBytesStart = memoryBytesStart;
            MemoryBytesEnd = memoryBytesEnd;
        }

        public float SoakSeconds { get; }
        public float WarmupSeconds { get; }
        public int TotalGameplayFrames { get; }
        public int SampleCount { get; }
        public float FpsAverage { get; }
        public float FpsMin { get; }
        public float FpsMax { get; }
        public float FrameMsP50 { get; }
        public float FrameMsP95 { get; }
        public float FrameMsP99 { get; }
        public float FrameMsMax { get; }
        public float SecondsBelow30Fps { get; }
        public float LongestBelow30StreakSeconds { get; }
        public long MemoryBytesStart { get; }
        public long MemoryBytesEnd { get; }
    }
}
