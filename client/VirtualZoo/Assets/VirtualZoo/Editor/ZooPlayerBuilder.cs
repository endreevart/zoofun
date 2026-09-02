using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace VirtualZoo.EditorTools
{
    public static class ZooPlayerBuilder
    {
        public static string OutputApp
        {
            get
            {
                return Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath, "..", "Builds", "macOS-dev", "VirtualZoo.app"));
            }
        }

        public static void BuildMacosDevelopment()
        {
            string output = OutputApp;
            string parent = Path.GetDirectoryName(output);
            if (!string.IsNullOrEmpty(parent))
            {
                Directory.CreateDirectory(parent);
            }

            var options = new BuildPlayerOptions
            {
                scenes = new[] { ZooSceneBuilder.ScenePath },
                locationPathName = output,
                target = BuildTarget.StandaloneOSX,
                options = BuildOptions.Development
            };

            var report = BuildPipeline.BuildPlayer(options);
            Debug.Log("ZOO_PLAYER_BUILD result=" + report.summary.result + " errors=" + report.summary.totalErrors + " path=" + output);
            EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
        }
    }
}
