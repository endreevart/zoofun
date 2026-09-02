using UnityEditor;
using UnityEngine;

namespace VirtualZoo.EditorTools
{
    [InitializeOnLoad]
    public static class HeroLayoutVersion
    {
        public const int V = 6;

        static HeroLayoutVersion()
        {
            Debug.Log("ZOO_VISUAL_COMPOSITION_KICK v6");
        }
    }
}
