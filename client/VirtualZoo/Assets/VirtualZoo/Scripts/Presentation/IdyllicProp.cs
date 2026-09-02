using UnityEngine;

namespace VirtualZoo.Presentation
{
    public sealed class IdyllicProp : MonoBehaviour
    {
        [SerializeField] string _prefabName;

        public string PrefabName => _prefabName;

        public void Bind(string prefabName)
        {
            _prefabName = prefabName;
        }
    }
}
