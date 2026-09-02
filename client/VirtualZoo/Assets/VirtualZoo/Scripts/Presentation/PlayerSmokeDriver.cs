using UnityEngine;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    public sealed class PlayerSmokeDriver : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (UnityEngine.Application.isEditor)
            {
                return;
            }

            if (!Requested())
            {
                return;
            }

            var go = new GameObject("PlayerSmokeDriver");
            DontDestroyOnLoad(go);
            go.AddComponent<PlayerSmokeDriver>();
        }

        static bool Requested()
        {
            if (System.Environment.GetEnvironmentVariable("ZOO_PLAYER_SMOKE") == "1")
            {
                return true;
            }

            string[] args = System.Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "-zooSmoke")
                {
                    return true;
                }
            }

            return false;
        }

        float _elapsed;
        bool _done;

        void Update()
        {
            if (_done)
            {
                return;
            }

            _elapsed += Time.unscaledDeltaTime;
            if (_elapsed < 1.4f)
            {
                return;
            }

            _done = true;
            var director = FindFirstObjectByType<ZooDirector>();
            if (director == null || director.ActiveCount != 20)
            {
                Fail("director or activeCreatures expected 20, got " + (director == null ? -1 : director.ActiveCount));
                return;
            }

            int walk = 0, hop = 0, fly = 0, floater = 0;
            var identities = FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            for (int i = 0; i < identities.Length; i++)
            {
                if (!identities[i].gameObject.activeInHierarchy)
                {
                    Fail("inactive creature " + identities[i].name);
                    return;
                }

                switch (identities[i].Locomotion)
                {
                    case LocomotionClass.Walk: walk++; break;
                    case LocomotionClass.Hop: hop++; break;
                    case LocomotionClass.Fly: fly++; break;
                    case LocomotionClass.Float: floater++; break;
                }
            }

            if (walk < 1 || hop < 1 || fly < 1 || floater < 1)
            {
                Fail("missing locomotion class walk=" + walk + " hop=" + hop + " fly=" + fly + " float=" + floater);
                return;
            }

            Debug.Log("ZOO_PLAYER_SMOKE_OK activeCreatures=20 walk=" + walk + " hop=" + hop + " fly=" + fly + " float=" + floater);
            UnityEngine.Application.Quit(0);
        }

        static void Fail(string reason)
        {
            Debug.LogError("ZOO_PLAYER_SMOKE_FAIL " + reason);
            UnityEngine.Application.Quit(1);
        }
    }
}
