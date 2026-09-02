using System;
using UnityEditor;

namespace VirtualZoo.EditorTools
{
    [InitializeOnLoad]
    public static class ZooSoakAutostart
    {
        static ZooSoakAutostart()
        {
            if (Environment.GetEnvironmentVariable("ZOO_RUN_SOAK") != "1")
            {
                return;
            }

            foreach (string arg in Environment.GetCommandLineArgs())
            {
                if (arg == "-runTests" || arg.Contains("ZooEvidenceRunner"))
                {
                    return;
                }
            }

            if (EditorApplication.isPlaying)
            {
                return;
            }

            EditorApplication.update += Kick;
        }

        static void Kick()
        {
            EditorApplication.update -= Kick;
            ZooSoakRunner.Run();
        }
    }
}
