using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace VirtualZoo.EditorTools
{
    public static class IdyllicPlayerBuilder
    {
        public static string OutputApp
        {
            get
            {
                return Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath, "..", "Builds", "macOS-idyllic", "VirtualZoo.app"));
            }
        }

        public static string[] PlayerScenes
        {
            get { return new[] { ZooIdyllicGardenBuilder.ScenePath }; }
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
                scenes = PlayerScenes,
                locationPathName = output,
                target = BuildTarget.StandaloneOSX,
                options = BuildOptions.Development
            };

            var report = BuildPipeline.BuildPlayer(options);
            Debug.Log("ZOO_IDYLLIC_PLAYER_BUILD result=" + report.summary.result + " errors=" + report.summary.totalErrors + " path=" + output);
            EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
        }

        public static void BuildIosXcodeUnsigned()
        {
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.iOS, BuildTarget.iOS))
            {
                Debug.Log("ZOO_IDYLLIC_IOS_SKIP module_not_installed");
                EditorApplication.Exit(0);
                return;
            }

            string output = Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath, "..", "Builds", "ios-idyllic"));
            Directory.CreateDirectory(output);
            PlayerSettings.SetArchitecture(NamedBuildTarget.iOS, 1);
            PlayerSettings.iOS.sdkVersion = iOSSdkVersion.DeviceSDK;
            var options = new BuildPlayerOptions
            {
                scenes = PlayerScenes,
                locationPathName = output,
                target = BuildTarget.iOS,
                options = BuildOptions.Development
            };

            var report = BuildPipeline.BuildPlayer(options);
            Debug.Log("ZOO_IDYLLIC_IOS_BUILD result=" + report.summary.result + " errors=" + report.summary.totalErrors + " path=" + output);
            EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
        }
    }
}
