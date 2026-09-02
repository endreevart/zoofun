using UnityEngine;
using UnityEngine.Rendering;
using VirtualZoo.Application;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    public sealed class CreatureFactoryV2
    {
        readonly Camera _camera;
        readonly Mesh _slab;
        readonly Mesh _nub;
        readonly Shader _cardShader;
        readonly float _waterHeight;

        public CreatureFactoryV2(Camera camera, Mesh slab, Mesh nub, Shader cardShader, float waterHeight)
        {
            _camera = camera;
            _slab = slab;
            _nub = nub;
            _cardShader = cardShader;
            _waterHeight = waterHeight;
        }

        public GameObject Create(LoadedFixture fixture, Transform parent, Transform[] waypoints, int seed)
        {
            if (fixture == null || fixture.Manifest == null || fixture.PngBytes == null || fixture.PngBytes.Length == 0 || _slab == null)
            {
                return null;
            }

            var validation = CreatureManifestValidator.Validate(fixture.Manifest, true);
            if (!validation.IsValid)
            {
                return null;
            }

            var texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            texture.wrapMode = TextureWrapMode.Clamp;
            texture.filterMode = FilterMode.Bilinear;
            if (!texture.LoadImage(fixture.PngBytes, false))
            {
                Object.Destroy(texture);
                return null;
            }

            texture.name = CreatureRuntimeAssets.RuntimePrefix + "Tex." + fixture.Manifest.CreatureId;
            Color bodyColor = SampleBody(texture);
            Color sideColor = Color.Lerp(bodyColor, new Color(0.22f, 0.14f, 0.1f, 1f), 0.18f);

            var root = new GameObject(fixture.Manifest.DisplayName);
            root.transform.SetParent(parent, false);

            var visualRoot = new GameObject("VisualRoot");
            visualRoot.transform.SetParent(root.transform, false);

            var sway = new GameObject("SwayRoot");
            sway.transform.SetParent(visualRoot.transform, false);

            float height = Mathf.Clamp(fixture.Manifest.Scale * 1.18f, 0.88f, 1.32f);
            float aspect = (float)texture.width / Mathf.Max(1, texture.height);
            float width = Mathf.Clamp(height * aspect, height * 0.7f, height * 1.22f);
            float thickness = 0.048f;

            var cardMat = CreateCardMaterial(texture, sideColor);
            cardMat.name = CreatureRuntimeAssets.RuntimePrefix + "CardMat." + fixture.Manifest.CreatureId;

            var front = CreateMeshChild("CardFront", sway.transform, CardQuad(), cardMat);
            front.transform.localPosition = new Vector3(0f, height * 0.5f, -thickness * 0.5f);
            front.transform.localScale = new Vector3(width, height, 1f);
            var frontRenderer = front.GetComponent<MeshRenderer>();
            frontRenderer.shadowCastingMode = ShadowCastingMode.On;
            frontRenderer.receiveShadows = true;

            var back = CreateMeshChild("CardBack", sway.transform, CardQuad(), cardMat);
            back.transform.localPosition = new Vector3(0f, height * 0.5f, thickness * 0.5f);
            back.transform.localRotation = Quaternion.Euler(0f, 180f, 0f);
            back.transform.localScale = new Vector3(width, height, 1f);

            var rimMat = ZooMaterials.CreateLit(sideColor);
            rimMat.name = CreatureRuntimeAssets.RuntimePrefix + "NubMat." + fixture.Manifest.CreatureId;
            if (rimMat.HasProperty("_Smoothness"))
            {
                rimMat.SetFloat("_Smoothness", 0.38f);
            }

            Transform tail = MakeNub("Tail", sway.transform, rimMat, new Vector3(0.02f * width, height * 0.34f, thickness * 0.85f), 0.065f * height);

            var shadow = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            shadow.name = "ContactShadow";
            Object.Destroy(shadow.GetComponent<Collider>());
            shadow.transform.SetParent(root.transform, false);
            shadow.transform.localPosition = new Vector3(0f, 0.018f, 0.03f);
            shadow.transform.localScale = new Vector3(width * 1.08f, 0.018f, width * 0.72f);
            var shadowMaterial = ZooMaterials.CreateShadowBlob();
            shadowMaterial.name = CreatureRuntimeAssets.RuntimePrefix + "ShadowMat." + fixture.Manifest.CreatureId;
            var shadowRenderer = shadow.GetComponent<MeshRenderer>();
            shadowRenderer.sharedMaterial = shadowMaterial;
            shadowRenderer.shadowCastingMode = ShadowCastingMode.Off;

            var presentation = root.AddComponent<CreaturePresentationV2>();
            presentation.Configure(
                visualRoot.transform,
                sway.transform,
                tail,
                tail,
                tail,
                null,
                null,
                _camera,
                _waterHeight);

            var assets = root.AddComponent<CreatureRuntimeAssets>();
            assets.Bind(texture, null, cardMat, shadowMaterial, rimMat);

            AddMotor(root, fixture.Manifest);
            var motor = root.GetComponent<CreatureMotor>();
            motor.Bind(fixture.Manifest, waypoints, seed, presentation);

            var identity = root.AddComponent<CreatureIdentity>();
            identity.Bind(fixture.Manifest);
            root.AddComponent<CreatureSpacing>();
            return root;
        }

        static Mesh _cardQuad;

        static Mesh CardQuad()
        {
            if (_cardQuad != null)
            {
                return _cardQuad;
            }

            _cardQuad = new Mesh { name = "CreatureCardQuad" };
            _cardQuad.vertices = new[]
            {
                new Vector3(-0.5f, -0.5f, 0f),
                new Vector3(0.5f, -0.5f, 0f),
                new Vector3(-0.5f, 0.5f, 0f),
                new Vector3(0.5f, 0.5f, 0f)
            };
            _cardQuad.uv = new[]
            {
                new Vector2(0f, 0f),
                new Vector2(1f, 0f),
                new Vector2(0f, 1f),
                new Vector2(1f, 1f)
            };
            _cardQuad.triangles = new[] { 0, 2, 1, 2, 3, 1 };
            _cardQuad.RecalculateNormals();
            _cardQuad.RecalculateBounds();
            return _cardQuad;
        }

        Transform MakeNub(string name, Transform parent, Material material, Vector3 localPos, float size)
        {
            var go = CreateMeshChild(name, parent, _nub != null ? _nub : _slab, material);
            go.transform.localPosition = localPos;
            go.transform.localScale = Vector3.one * size;
            var renderer = go.GetComponent<MeshRenderer>();
            renderer.shadowCastingMode = ShadowCastingMode.On;
            renderer.receiveShadows = true;
            return go.transform;
        }

        Material CreateCardMaterial(Texture2D texture, Color side)
        {
            var shader = _cardShader != null ? _cardShader : Shader.Find("VirtualZoo/CreatureCard");
            if (shader == null)
            {
                var fallback = ZooMaterials.CreateLit(Color.white);
                fallback.mainTexture = texture;
                if (fallback.HasProperty("_BaseMap"))
                {
                    fallback.SetTexture("_BaseMap", texture);
                }

                if (fallback.HasProperty("_Smoothness"))
                {
                    fallback.SetFloat("_Smoothness", 0.28f);
                }

                return fallback;
            }

            var material = new Material(shader);
            material.SetTexture("_BaseMap", texture);
            material.mainTexture = texture;
            if (material.HasProperty("_BaseColor"))
            {
                material.SetColor("_BaseColor", Color.white);
            }

            if (material.HasProperty("_SideColor"))
            {
                material.SetColor("_SideColor", side);
            }

            if (material.HasProperty("_Cutoff"))
            {
                material.SetFloat("_Cutoff", 0.16f);
            }

            if (material.HasProperty("_Smoothness"))
            {
                material.SetFloat("_Smoothness", 0.3f);
            }

            if (material.HasProperty("_Wrap"))
            {
                material.SetFloat("_Wrap", 0.48f);
            }

            if (material.HasProperty("_Rim"))
            {
                material.SetFloat("_Rim", 0.34f);
            }

            if (material.HasProperty("_Fill"))
            {
                material.SetFloat("_Fill", 0.07f);
            }

            return material;
        }

        static GameObject CreateMeshChild(string name, Transform parent, Mesh mesh, Material material)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var filter = go.AddComponent<MeshFilter>();
            filter.sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            return go;
        }

        static Color SampleBody(Texture2D texture)
        {
            var pixels = texture.GetPixels32();
            float r = 0f, g = 0f, b = 0f, w = 0f;
            int step = Mathf.Max(1, pixels.Length / 1800);
            for (int i = 0; i < pixels.Length; i += step)
            {
                if (pixels[i].a < 48)
                {
                    continue;
                }

                r += pixels[i].r;
                g += pixels[i].g;
                b += pixels[i].b;
                w += 255f;
            }

            if (w < 1f)
            {
                return new Color(0.72f, 0.52f, 0.38f, 1f);
            }

            return new Color(r / w, g / w, b / w, 1f);
        }

        static void AddMotor(GameObject root, CreatureManifest manifest)
        {
            switch (manifest.Locomotion)
            {
                case LocomotionClass.Walk:
                    EnsureAgent(root);
                    root.AddComponent<WalkLocomotion>();
                    break;
                case LocomotionClass.Hop:
                    EnsureAgent(root);
                    root.AddComponent<HopLocomotion>();
                    break;
                case LocomotionClass.Fly:
                    root.AddComponent<FlyLocomotion>();
                    break;
                case LocomotionClass.Float:
                    root.AddComponent<FloatLocomotion>();
                    break;
            }
        }

        static void EnsureAgent(GameObject root)
        {
            var agent = root.GetComponent<UnityEngine.AI.NavMeshAgent>();
            if (agent == null)
            {
                agent = root.AddComponent<UnityEngine.AI.NavMeshAgent>();
            }

            agent.updateRotation = false;
            agent.updateUpAxis = true;
        }
    }
}
