using System.Collections;
using System.Globalization;
using System.IO;
using System.Text;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using VirtualZoo.Domain;
using VirtualZoo.Presentation;

namespace VirtualZoo.Tests.PlayMode
{
    public sealed class SoakEvidenceTests
    {
        [UnityTest]
        [Explicit("Five-minute soak runs through ZooSoakRunner with a graphics device.")]
        [Timeout(420000)]
        public IEnumerator Five_minute_runtime_soak_captures_evidence()
        {
            var op = UnityEngine.SceneManagement.SceneManager.LoadSceneAsync("ZooGarden");
            yield return op;
            yield return null;

            var director = Object.FindFirstObjectByType<ZooDirector>();
            var overlay = Object.FindFirstObjectByType<DeveloperOverlay>();
            var rig = Object.FindFirstObjectByType<ZooCameraRig>();
            var camera = Camera.main;
            Assert.That(director, Is.Not.Null);
            Assert.That(camera, Is.Not.Null);
            if (overlay != null)
            {
                overlay.Visible = true;
            }

            Directory.CreateDirectory(EvidenceDir());
            var log = new StringBuilder();
            UnityEngine.Application.logMessageReceived += (c, s, t) => log.AppendLine(t + ": " + c);

            float start = Time.realtimeSinceStartup;
            while (Time.realtimeSinceStartup - start < 12f)
            {
                if (rig != null)
                {
                    rig.NudgeForSoak(Time.realtimeSinceStartup - start);
                }

                yield return null;
            }

            CaptureViews(camera, director);
            Assert.That(director.ActiveCount, Is.GreaterThanOrEqualTo(20));

            while (Time.realtimeSinceStartup - start < 300f)
            {
                if (rig != null)
                {
                    rig.NudgeForSoak(Time.realtimeSinceStartup - start);
                }

                yield return null;
            }

            CaptureViews(camera, director);
            var snap = overlay != null ? overlay.Snapshot() : default;
            float elapsed = Time.realtimeSinceStartup - start;
            File.WriteAllText(
                Path.Combine(EvidenceDir(), "soak-metrics.json"),
                string.Format(
                    CultureInfo.InvariantCulture,
                    "{{\n  \"soakSeconds\": {0:0.00},\n  \"activeCreatures\": {1},\n  \"fps\": {2:0.00},\n  \"frameMs\": {3:0.00},\n  \"memoryBytes\": {4},\n  \"consoleLogChars\": {5}\n}}\n",
                    elapsed,
                    director.ActiveCount,
                    snap.Fps,
                    snap.FrameMs,
                    snap.MemoryBytes,
                    log.Length));
            File.WriteAllText(Path.Combine(EvidenceDir(), "console-soak.log"), log.ToString());
            Assert.That(director.ActiveCount, Is.GreaterThanOrEqualTo(20));
            Assert.That(elapsed, Is.GreaterThanOrEqualTo(299f));
        }

        static void CaptureViews(Camera camera, ZooDirector director)
        {
            Capture(camera, 1600, 1200, "gameview-ipad-4x3.png");
            Capture(camera, 1920, 886, "gameview-iphone-landscape.png");
            Transform walk = null;
            Transform floater = null;
            foreach (var id in Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None))
            {
                if (id.Locomotion == LocomotionClass.Walk && walk == null)
                {
                    walk = id.transform;
                }

                if (id.Locomotion == LocomotionClass.Float && floater == null)
                {
                    floater = id.transform;
                }
            }

            Vector3 pos = camera.transform.position;
            Quaternion rot = camera.transform.rotation;
            if (walk != null)
            {
                camera.transform.position = walk.position + new Vector3(1.2f, 2.2f, -5.2f);
                camera.transform.LookAt(walk.position + Vector3.up * 0.5f);
                Capture(camera, 1440, 1080, "closeup-walk-hop.png");
            }

            if (floater != null)
            {
                camera.transform.position = floater.position + new Vector3(2.2f, 2.8f, -6.0f);
                camera.transform.LookAt(floater.position + Vector3.up * 0.3f);
                Capture(camera, 1440, 1080, "zone-fly-float.png");
            }

            camera.transform.position = pos;
            camera.transform.rotation = rot;
        }

        static void Capture(Camera camera, int width, int height, string fileName)
        {
            var rt = new RenderTexture(width, height, 24);
            var prev = camera.targetTexture;
            camera.targetTexture = rt;
            camera.Render();
            RenderTexture.active = rt;
            var tex = new Texture2D(width, height, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            tex.Apply();
            camera.targetTexture = prev;
            RenderTexture.active = null;
            File.WriteAllBytes(Path.Combine(EvidenceDir(), fileName), tex.EncodeToPNG());
            Object.Destroy(tex);
            rt.Release();
        }

        static string EvidenceDir()
        {
            return Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath, "..", "..", "..", "handoff", "evidence", "iteration-01"));
        }
    }
}
