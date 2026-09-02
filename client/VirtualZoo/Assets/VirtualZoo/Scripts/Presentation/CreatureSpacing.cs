using UnityEngine;

namespace VirtualZoo.Presentation
{
    public sealed class CreatureSpacing : MonoBehaviour
    {
        CreatureIdentity _identity;

        void Awake()
        {
            _identity = GetComponent<CreatureIdentity>();
        }

        void OnEnable()
        {
            if (_identity == null)
            {
                _identity = GetComponent<CreatureIdentity>();
            }

            CreatureSpacingRegistry.Register(_identity);
        }

        void OnDisable()
        {
            CreatureSpacingRegistry.Unregister(_identity);
        }

        void OnDestroy()
        {
            CreatureSpacingRegistry.Unregister(_identity);
        }
    }
}
