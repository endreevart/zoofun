using UnityEngine;

namespace VirtualZoo.Presentation
{
    public sealed class CreatureRuntimeAssets : MonoBehaviour
    {
        public const string RuntimePrefix = "VZRuntime.";

        Texture2D _texture;
        Sprite _sprite;
        Material _spriteMaterial;
        Material _shadowMaterial;
        Material _extraMaterial;
        bool _released;

        public int OwnedCount
        {
            get
            {
                int count = 0;
                if (_texture != null)
                {
                    count++;
                }

                if (_sprite != null)
                {
                    count++;
                }

                if (_spriteMaterial != null)
                {
                    count++;
                }

                if (_shadowMaterial != null)
                {
                    count++;
                }

                if (_extraMaterial != null)
                {
                    count++;
                }

                return count;
            }
        }

        public void Bind(Texture2D texture, Sprite sprite, Material spriteMaterial, Material shadowMaterial)
        {
            Bind(texture, sprite, spriteMaterial, shadowMaterial, null);
        }

        public void Bind(Texture2D texture, Sprite sprite, Material spriteMaterial, Material shadowMaterial, Material extraMaterial)
        {
            _texture = texture;
            _sprite = sprite;
            _spriteMaterial = spriteMaterial;
            _shadowMaterial = shadowMaterial;
            _extraMaterial = extraMaterial;
            _released = false;
        }

        public void Release()
        {
            if (_released)
            {
                return;
            }

            _released = true;
            var spriteRenderers = GetComponentsInChildren<SpriteRenderer>(true);
            for (int i = 0; i < spriteRenderers.Length; i++)
            {
                if (spriteRenderers[i] != null)
                {
                    spriteRenderers[i].sprite = null;
                    spriteRenderers[i].sharedMaterial = null;
                }
            }

            var meshRenderers = GetComponentsInChildren<MeshRenderer>(true);
            for (int i = 0; i < meshRenderers.Length; i++)
            {
                if (meshRenderers[i] != null)
                {
                    meshRenderers[i].sharedMaterial = null;
                    meshRenderers[i].sharedMaterials = new Material[0];
                }
            }

            DestroyOwned(_sprite);
            DestroyOwned(_texture);
            DestroyOwned(_spriteMaterial);
            DestroyOwned(_shadowMaterial);
            DestroyOwned(_extraMaterial);
            _sprite = null;
            _texture = null;
            _spriteMaterial = null;
            _shadowMaterial = null;
            _extraMaterial = null;
        }

        void OnDestroy()
        {
            Release();
        }

        static void DestroyOwned(Object owned)
        {
            if (owned == null)
            {
                return;
            }

            if (UnityEngine.Application.isPlaying)
            {
                Destroy(owned);
            }
            else
            {
                DestroyImmediate(owned);
            }
        }

        public static int CountLiveRuntimeAssets()
        {
            int count = 0;
            count += CountNamed(Resources.FindObjectsOfTypeAll<Texture2D>());
            count += CountNamed(Resources.FindObjectsOfTypeAll<Sprite>());
            count += CountNamed(Resources.FindObjectsOfTypeAll<Material>());
            return count;
        }

        static int CountNamed(Object[] objects)
        {
            int count = 0;
            for (int i = 0; i < objects.Length; i++)
            {
                if (objects[i] != null && objects[i].name != null && objects[i].name.StartsWith(RuntimePrefix))
                {
                    count++;
                }
            }

            return count;
        }
    }
}
