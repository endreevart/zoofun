using System;
using System.Collections.Generic;
using UnityEngine;

namespace VirtualZoo.Presentation
{
    public static class GardenMeshFactory
    {
        public const string MeadowName = "MeadowSurface";
        public const string PathName = "PathRibbon";
        public const string WaterName = "PondWater";
        public const string BankName = "PondBank";
        public const string VergeName = "PathVerge";
        public const string BasinName = "PondBasin";
        public const string GateName = "ZooGate";
        public const float MeadowExtent = 32f;
        public const float PlayableRadius = 13.2f;

        public static Vector3[] PathControlPoints()
        {
            return new[]
            {
                new Vector3(-0.2f, 0f, -9.4f),
                new Vector3(1.4f, 0f, -7.0f),
                new Vector3(2.8f, 0f, -4.5f),
                new Vector3(2.1f, 0f, -2.0f),
                new Vector3(3.1f, 0f, 0.6f),
                new Vector3(4.8f, 0f, 2.8f),
                new Vector3(5.7f, 0f, 5.1f),
                new Vector3(4.3f, 0f, 7.2f)
            };
        }

        public static Mesh CreateMeadow(Vector3 pondCenter, Vector2 pondExtents)
        {
            return CreateMeadow(pondCenter, pondExtents, 11.2f);
        }

        public static float PondRadius(Vector2 extents, float angle)
        {
            float c = Mathf.Cos(angle);
            float s = Mathf.Sin(angle);
            float ellipse = (extents.x * extents.y) /
                            Mathf.Sqrt((extents.y * c) * (extents.y * c) + (extents.x * s) * (extents.x * s));
            float wobble = 1f
                           + 0.18f * Mathf.Sin(angle * 2f + 0.42f)
                           + 0.11f * Mathf.Sin(angle * 3f + 1.85f)
                           + 0.07f * Mathf.Cos(angle * 5f + 0.55f);
            return ellipse * wobble;
        }

        public static bool IsInsidePond(Vector3 point, Vector3 center, Vector2 extents, float pad)
        {
            Vector2 delta = new Vector2(point.x - center.x, point.z - center.z);
            float mag = delta.magnitude;
            if (mag < 0.0001f)
            {
                return true;
            }

            float angle = Mathf.Atan2(delta.y, delta.x);
            return mag <= PondRadius(extents, angle) + pad;
        }

        public static Mesh CreateMeadow(Vector3 pondCenter, Vector2 pondExtents, float extent)
        {
            const int div = 64;
            float step = (extent * 2f) / div;
            var verts = new Vector3[(div + 1) * (div + 1)];
            var uvs = new Vector2[verts.Length];
            var tris = new System.Collections.Generic.List<int>(div * div * 6);
            bool sculpt = extent > 16f;

            for (int z = 0; z <= div; z++)
            {
                for (int x = 0; x <= div; x++)
                {
                    float wx = -extent + x * step;
                    float wz = -extent + z * step;
                    float radial = Mathf.Sqrt(wx * wx + wz * wz);
                    float playable = extent * 0.36f;
                    float hillEnd = extent * 0.92f;
                    float rim = sculpt
                        ? Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(playable, hillEnd, radial))
                        : 0f;
                    float noise = Mathf.PerlinNoise(wx * 0.07f + 3.1f, wz * 0.07f + 1.4f);
                    float micro = 0.01f * Mathf.Sin(wx * 0.33f + 0.4f) * Mathf.Cos(wz * 0.27f);
                    float h = micro + rim * rim * (6.2f + noise * 2.4f);
                    if (sculpt)
                    {
                        Vector2 delta = new Vector2(wx - pondCenter.x, wz - pondCenter.z);
                        float mag = delta.magnitude;
                        float angle = mag < 0.0001f ? 0f : Mathf.Atan2(delta.y, delta.x);
                        float pondR = PondRadius(pondExtents, angle);
                        float bowl = Mathf.SmoothStep(
                            0f,
                            1f,
                            Mathf.InverseLerp(pondR + 1.55f, pondR - 0.08f, mag));
                        h = Mathf.Lerp(h, -0.34f, bowl);
                    }

                    int i = z * (div + 1) + x;
                    verts[i] = new Vector3(wx, h, wz);
                    uvs[i] = new Vector2((wx + extent) / (extent * 2f) * 3.4f, (wz + extent) / (extent * 2f) * 3.4f);
                }
            }

            for (int z = 0; z < div; z++)
            {
                for (int x = 0; x < div; x++)
                {
                    int i0 = z * (div + 1) + x;
                    int i1 = i0 + 1;
                    int i2 = i0 + (div + 1);
                    int i3 = i2 + 1;
                    tris.Add(i0);
                    tris.Add(i2);
                    tris.Add(i1);
                    tris.Add(i1);
                    tris.Add(i2);
                    tris.Add(i3);
                }
            }

            var mesh = new Mesh { name = MeadowName };
            mesh.vertices = verts;
            mesh.uv = uvs;
            mesh.triangles = tris.ToArray();
            OrientUp(mesh);
            mesh.RecalculateBounds();
            Validate(mesh);
            return mesh;
        }

        public static Mesh CreatePathRibbon(float width, float y)
        {
            return CreatePathRibbon(width, y, PathControlPoints());
        }

        public static Mesh CreatePathRibbon(float width, float y, Vector3[] controls)
        {
            var samples = SampleCatmull(controls, 10);
            var left = new Vector3[samples.Length];
            var right = new Vector3[samples.Length];
            for (int i = 0; i < samples.Length; i++)
            {
                Vector3 tangent = i == samples.Length - 1
                    ? (samples[i] - samples[i - 1]).normalized
                    : (samples[Mathf.Min(i + 1, samples.Length - 1)] - samples[i]).normalized;
                if (tangent.sqrMagnitude < 0.0001f)
                {
                    tangent = Vector3.forward;
                }

                Vector3 side = Vector3.Cross(Vector3.up, tangent).normalized * (width * 0.5f);
                left[i] = samples[i] - side;
                right[i] = samples[i] + side;
            }

            int cap = 8;
            int vertCount = 2 + cap * 2 + samples.Length * 2;
            var verts = new Vector3[vertCount];
            var uvs = new Vector2[vertCount];
            int v = 0;
            verts[v] = samples[0];
            verts[v].y = y;
            uvs[v] = new Vector2(0.5f, 0f);
            v++;
            Vector3 startTan = (samples[1] - samples[0]).normalized;
            Vector3 startSide = Vector3.Cross(Vector3.up, startTan).normalized;
            int startRim = v;
            for (int i = 0; i < cap; i++)
            {
                float ang = Mathf.PI * (i / (float)(cap - 1));
                Vector3 dir = -startTan * Mathf.Sin(ang) - startSide * Mathf.Cos(ang);
                verts[v] = samples[0] + dir * (width * 0.5f);
                verts[v].y = y;
                uvs[v] = new Vector2(i / (float)(cap - 1), 0f);
                v++;
            }

            int body = v;
            for (int i = 0; i < samples.Length; i++)
            {
                verts[v] = left[i];
                verts[v].y = y;
                uvs[v] = new Vector2(0f, i / (float)(samples.Length - 1));
                v++;
                verts[v] = right[i];
                verts[v].y = y;
                uvs[v] = new Vector2(1f, i / (float)(samples.Length - 1));
                v++;
            }

            Vector3 endTan = (samples[samples.Length - 1] - samples[samples.Length - 2]).normalized;
            Vector3 endSide = Vector3.Cross(Vector3.up, endTan).normalized;
            Vector3 end = samples[samples.Length - 1];
            int endCenter = v;
            verts[v] = end;
            verts[v].y = y;
            uvs[v] = new Vector2(0.5f, 1f);
            v++;
            int endRim = v;
            for (int i = 0; i < cap; i++)
            {
                float ang = Mathf.PI * (i / (float)(cap - 1));
                Vector3 dir = endTan * Mathf.Sin(ang) + endSide * Mathf.Cos(ang);
                verts[v] = end + dir * (width * 0.5f);
                verts[v].y = y;
                uvs[v] = new Vector2(i / (float)(cap - 1), 1f);
                v++;
            }

            var tris = new System.Collections.Generic.List<int>();
            for (int i = 0; i < cap - 1; i++)
            {
                tris.Add(0);
                tris.Add(startRim + i);
                tris.Add(startRim + i + 1);
            }

            for (int i = 0; i < samples.Length - 1; i++)
            {
                int a = body + i * 2;
                int b = a + 1;
                int c = a + 2;
                int d = a + 3;
                tris.Add(a);
                tris.Add(c);
                tris.Add(b);
                tris.Add(b);
                tris.Add(c);
                tris.Add(d);
            }

            for (int i = 0; i < cap - 1; i++)
            {
                tris.Add(endCenter);
                tris.Add(endRim + i + 1);
                tris.Add(endRim + i);
            }

            var mesh = new Mesh { name = PathName };
            mesh.vertices = verts;
            mesh.uv = uvs;
            mesh.triangles = tris.ToArray();
            OrientUp(mesh);
            mesh.RecalculateBounds();
            Validate(mesh);
            return mesh;
        }

        public static Mesh CreateWater(Vector3 center, Vector2 extents, float y)
        {
            const int seg = 32;
            var verts = new Vector3[seg + 1];
            var uvs = new Vector2[seg + 1];
            verts[0] = new Vector3(center.x, y, center.z);
            uvs[0] = new Vector2(0.5f, 0.5f);
            for (int i = 0; i < seg; i++)
            {
                float a = i / (float)seg * Mathf.PI * 2f;
                verts[i + 1] = new Vector3(center.x + Mathf.Cos(a) * extents.x, y, center.z + Mathf.Sin(a) * extents.y);
                uvs[i + 1] = new Vector2(0.5f + Mathf.Cos(a) * 0.5f, 0.5f + Mathf.Sin(a) * 0.5f);
            }

            var tris = new int[seg * 3];
            for (int i = 0; i < seg; i++)
            {
                tris[i * 3] = 0;
                tris[i * 3 + 1] = i + 1;
                tris[i * 3 + 2] = i + 2 > seg ? 1 : i + 2;
            }

            var mesh = new Mesh { name = WaterName };
            mesh.vertices = verts;
            mesh.uv = uvs;
            mesh.triangles = tris;
            OrientUp(mesh);
            mesh.RecalculateBounds();
            Validate(mesh);
            return mesh;
        }

        public static Mesh CreateBank(Vector3 center, Vector2 inner, Vector2 outer, float innerY, float outerY)
        {
            const int seg = 32;
            var verts = new Vector3[seg * 2];
            var uvs = new Vector2[seg * 2];
            for (int i = 0; i < seg; i++)
            {
                float a = i / (float)seg * Mathf.PI * 2f;
                float c = Mathf.Cos(a);
                float s = Mathf.Sin(a);
                verts[i] = new Vector3(center.x + c * inner.x, innerY, center.z + s * inner.y);
                verts[i + seg] = new Vector3(center.x + c * outer.x, outerY, center.z + s * outer.y);
                uvs[i] = new Vector2(0f, i / (float)seg);
                uvs[i + seg] = new Vector2(1f, i / (float)seg);
            }

            var tris = new int[seg * 6];
            int t = 0;
            for (int i = 0; i < seg; i++)
            {
                int n = (i + 1) % seg;
                tris[t++] = i;
                tris[t++] = i + seg;
                tris[t++] = n;
                tris[t++] = n;
                tris[t++] = i + seg;
                tris[t++] = n + seg;
            }

            var mesh = new Mesh { name = BankName };
            mesh.vertices = verts;
            mesh.uv = uvs;
            mesh.triangles = tris;
            OrientUp(mesh);
            mesh.RecalculateBounds();
            Validate(mesh);
            return mesh;
        }

        public static Mesh CreateIrregularWater(Vector3 center, Vector2 extents, float y, float radiusScale)
        {
            const int seg = 48;
            var verts = new Vector3[seg + 1];
            var uvs = new Vector2[seg + 1];
            verts[0] = new Vector3(center.x, y, center.z);
            uvs[0] = new Vector2(0.5f, 0.5f);
            for (int i = 0; i < seg; i++)
            {
                float a = i / (float)seg * Mathf.PI * 2f;
                float r = PondRadius(extents, a) * radiusScale;
                verts[i + 1] = new Vector3(center.x + Mathf.Cos(a) * r, y, center.z + Mathf.Sin(a) * r);
                uvs[i + 1] = new Vector2(0.5f + Mathf.Cos(a) * 0.5f, 0.5f + Mathf.Sin(a) * 0.5f);
            }

            var tris = new int[seg * 3];
            for (int i = 0; i < seg; i++)
            {
                tris[i * 3] = 0;
                tris[i * 3 + 1] = i + 1;
                tris[i * 3 + 2] = i + 2 > seg ? 1 : i + 2;
            }

            var mesh = new Mesh { name = WaterName };
            mesh.vertices = verts;
            mesh.uv = uvs;
            mesh.triangles = tris;
            OrientUp(mesh);
            mesh.RecalculateBounds();
            Validate(mesh);
            return mesh;
        }

        public static Mesh CreateIrregularBank(Vector3 center, Vector2 extents, float innerScale, float outerPad, float innerY, float outerY)
        {
            const int seg = 48;
            var verts = new Vector3[seg * 2];
            var uvs = new Vector2[seg * 2];
            for (int i = 0; i < seg; i++)
            {
                float a = i / (float)seg * Mathf.PI * 2f;
                float c = Mathf.Cos(a);
                float s = Mathf.Sin(a);
                float inner = PondRadius(extents, a) * innerScale;
                float outer = PondRadius(extents, a) + outerPad;
                verts[i] = new Vector3(center.x + c * inner, innerY, center.z + s * inner);
                verts[i + seg] = new Vector3(center.x + c * outer, outerY, center.z + s * outer);
                uvs[i] = new Vector2(0f, i / (float)seg);
                uvs[i + seg] = new Vector2(1f, i / (float)seg);
            }

            var tris = new int[seg * 6];
            int t = 0;
            for (int i = 0; i < seg; i++)
            {
                int n = (i + 1) % seg;
                tris[t++] = i;
                tris[t++] = i + seg;
                tris[t++] = n;
                tris[t++] = n;
                tris[t++] = i + seg;
                tris[t++] = n + seg;
            }

            var mesh = new Mesh { name = BankName };
            mesh.vertices = verts;
            mesh.uv = uvs;
            mesh.triangles = tris;
            OrientUp(mesh);
            mesh.RecalculateBounds();
            Validate(mesh);
            return mesh;
        }

        public static Mesh CreateDirtPath(float width, float y, Vector3[] controls)
        {
            var samples = SampleCatmull(controls, 12);
            int count = samples.Length;
            var verts = new Vector3[count * 2];
            var uvs = new Vector2[count * 2];
            float length = 0f;
            var dist = new float[count];
            for (int i = 1; i < count; i++)
            {
                length += Vector3.Distance(samples[i - 1], samples[i]);
                dist[i] = length;
            }

            for (int i = 0; i < count; i++)
            {
                Vector3 tangent = i == count - 1
                    ? (samples[i] - samples[i - 1]).normalized
                    : (samples[Mathf.Min(i + 1, count - 1)] - samples[i]).normalized;
                if (tangent.sqrMagnitude < 0.0001f)
                {
                    tangent = Vector3.forward;
                }

                float t = dist[i] / Mathf.Max(0.001f, length);
                float w = width * (0.86f + 0.18f * Mathf.Sin(t * Mathf.PI * 3.2f + 0.4f));
                Vector3 side = Vector3.Cross(Vector3.up, tangent).normalized * (w * 0.5f);
                verts[i * 2] = samples[i] - side;
                verts[i * 2].y = y;
                verts[i * 2 + 1] = samples[i] + side;
                verts[i * 2 + 1].y = y;
                uvs[i * 2] = new Vector2(verts[i * 2].x * 0.38f, verts[i * 2].z * 0.38f);
                uvs[i * 2 + 1] = new Vector2(verts[i * 2 + 1].x * 0.38f, verts[i * 2 + 1].z * 0.38f);
            }

            var tris = new System.Collections.Generic.List<int>();
            for (int i = 0; i < count - 1; i++)
            {
                int a = i * 2;
                int b = a + 1;
                int c = a + 2;
                int d = a + 3;
                tris.Add(a);
                tris.Add(c);
                tris.Add(b);
                tris.Add(b);
                tris.Add(c);
                tris.Add(d);
            }

            var mesh = new Mesh { name = PathName };
            mesh.vertices = verts;
            mesh.uv = uvs;
            mesh.triangles = tris.ToArray();
            OrientUp(mesh);
            mesh.RecalculateBounds();
            Validate(mesh);
            return mesh;
        }

        public static Mesh CreateBlendedDirtPath(float width, float y, Vector3[] controls)
        {
            var samples = SampleCatmull(controls, 14);
            int count = samples.Length;
            var verts = new Vector3[count * 6];
            var uvs = new Vector2[count * 6];
            float length = 0f;
            var dist = new float[count];
            for (int i = 1; i < count; i++)
            {
                length += Vector3.Distance(samples[i - 1], samples[i]);
                dist[i] = length;
            }

            for (int i = 0; i < count; i++)
            {
                Vector3 tangent = i == count - 1
                    ? (samples[i] - samples[i - 1]).normalized
                    : (samples[Mathf.Min(i + 1, count - 1)] - samples[i]).normalized;
                if (tangent.sqrMagnitude < 0.0001f)
                {
                    tangent = Vector3.forward;
                }

                float t = dist[i] / Mathf.Max(0.001f, length);
                float end = Mathf.SmoothStep(0f, 1f, Mathf.Min(t, 1f - t) / 0.08f);
                float w = width * (0.84f + 0.16f * Mathf.Sin(t * Mathf.PI * 2.4f + 0.3f)) * (0.48f + 0.52f * end);
                float leftScale = 0.92f + 0.18f * Mathf.PerlinNoise(samples[i].x * 0.38f, 2.1f);
                float rightScale = 0.92f + 0.18f * Mathf.PerlinNoise(samples[i].z * 0.38f, 5.4f);
                Vector3 side = Vector3.Cross(Vector3.up, tangent).normalized;
                float inner = w * 0.11f;
                float mid = w * 0.24f;
                Vector3 leftOuter = samples[i] - side * (w * 0.5f * leftScale);
                Vector3 leftMid = samples[i] - side * mid;
                Vector3 leftInner = samples[i] - side * inner;
                Vector3 rightInner = samples[i] + side * inner;
                Vector3 rightMid = samples[i] + side * mid;
                Vector3 rightOuter = samples[i] + side * (w * 0.5f * rightScale);
                int v = i * 6;
                verts[v] = leftOuter;
                verts[v].y = y;
                verts[v + 1] = leftMid;
                verts[v + 1].y = y + 0.002f;
                verts[v + 2] = leftInner;
                verts[v + 2].y = y + 0.005f;
                verts[v + 3] = rightInner;
                verts[v + 3].y = y + 0.005f;
                verts[v + 4] = rightMid;
                verts[v + 4].y = y + 0.002f;
                verts[v + 5] = rightOuter;
                verts[v + 5].y = y;
                for (int k = 0; k < 6; k++)
                {
                    uvs[v + k] = new Vector2(verts[v + k].x * 0.34f, verts[v + k].z * 0.34f);
                }
            }

            var innerTris = new System.Collections.Generic.List<int>();
            var outerTris = new System.Collections.Generic.List<int>();
            for (int i = 0; i < count - 1; i++)
            {
                int a = i * 6;
                AddQuad(outerTris, a, a + 6, a + 1, a + 7);
                AddQuad(outerTris, a + 1, a + 7, a + 2, a + 8);
                AddQuad(innerTris, a + 2, a + 8, a + 3, a + 9);
                AddQuad(outerTris, a + 3, a + 9, a + 4, a + 10);
                AddQuad(outerTris, a + 4, a + 10, a + 5, a + 11);
            }

            var mesh = new Mesh { name = PathName };
            mesh.vertices = verts;
            mesh.uv = uvs;
            mesh.subMeshCount = 2;
            mesh.SetTriangles(innerTris, 0);
            mesh.SetTriangles(outerTris, 1);
            OrientUpSubmeshes(mesh);
            mesh.RecalculateBounds();
            Validate(mesh);
            return mesh;
        }

        public static Mesh CreateStoryGate()
        {
            var verts = new List<Vector3>(320);
            var uvs = new List<Vector2>(320);
            var tris = new List<int>(480);

            AddBox(verts, uvs, tris, new Vector3(-2.42f, 0.40f, 0f), new Vector3(1.42f, 0.80f, 0.78f));
            AddBox(verts, uvs, tris, new Vector3(2.42f, 0.40f, 0f), new Vector3(1.42f, 0.80f, 0.78f));
            AddBox(verts, uvs, tris, new Vector3(-2.42f, 0.86f, 0f), new Vector3(1.48f, 0.12f, 0.86f));
            AddBox(verts, uvs, tris, new Vector3(2.42f, 0.86f, 0f), new Vector3(1.48f, 0.12f, 0.86f));
            AddBox(verts, uvs, tris, new Vector3(-3.08f, 0.14f, 0.04f), new Vector3(0.38f, 0.28f, 0.90f));
            AddBox(verts, uvs, tris, new Vector3(3.08f, 0.14f, 0.04f), new Vector3(0.38f, 0.28f, 0.90f));
            AddBox(verts, uvs, tris, new Vector3(-1.22f, 1.34f, 0f), new Vector3(0.52f, 0.20f, 0.90f));
            AddBox(verts, uvs, tris, new Vector3(1.22f, 1.34f, 0f), new Vector3(0.52f, 0.20f, 0.90f));
            AddArch(verts, uvs, tris, 1.08f, 1.74f, 1.44f, 0.56f, 22);
            AddBox(verts, uvs, tris, new Vector3(0f, 3.24f, 0f), new Vector3(0.46f, 0.24f, 1.02f));

            var mesh = new Mesh { name = GateName };
            mesh.SetVertices(verts);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            Validate(mesh);
            return mesh;
        }

        public static Mesh CreateStonePlinth()
        {
            var verts = new List<Vector3>(72);
            var uvs = new List<Vector2>(72);
            var tris = new List<int>(108);
            AddBox(verts, uvs, tris, new Vector3(0f, 0.12f, 0f), new Vector3(0.54f, 0.24f, 0.86f));
            AddBox(verts, uvs, tris, new Vector3(0f, 0.82f, 0f), new Vector3(0.46f, 1.16f, 0.82f));
            var mesh = new Mesh { name = "GatePlinth" };
            mesh.SetVertices(verts);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            Validate(mesh);
            return mesh;
        }

        public static Mesh CreateGroundPad(float width, float height, float depth)
        {
            var verts = new List<Vector3>(24);
            var uvs = new List<Vector2>(24);
            var tris = new List<int>(36);
            AddBox(verts, uvs, tris, new Vector3(0f, height * 0.5f, 0f), new Vector3(width, height, depth));
            var mesh = new Mesh { name = "BridgePad" };
            mesh.SetVertices(verts);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            Validate(mesh);
            return mesh;
        }

        public static void Validate(Mesh mesh)
        {
            if (mesh == null)
            {
                throw new InvalidOperationException("Mesh is null.");
            }

            var verts = mesh.vertices;
            var tris = mesh.triangles;
            if (verts == null || verts.Length < 3)
            {
                throw new InvalidOperationException(mesh.name + " has too few vertices.");
            }

            if (tris == null || tris.Length < 3 || tris.Length % 3 != 0)
            {
                throw new InvalidOperationException(mesh.name + " has invalid triangles.");
            }

            for (int i = 0; i < verts.Length; i++)
            {
                if (!IsFinite(verts[i]))
                {
                    throw new InvalidOperationException(mesh.name + " has a non-finite vertex.");
                }
            }

            int valid = 0;
            for (int i = 0; i < tris.Length; i += 3)
            {
                int a = tris[i];
                int b = tris[i + 1];
                int c = tris[i + 2];
                if (a < 0 || b < 0 || c < 0 || a >= verts.Length || b >= verts.Length || c >= verts.Length)
                {
                    throw new InvalidOperationException(mesh.name + " triangle index is out of range.");
                }

                Vector3 ab = verts[b] - verts[a];
                Vector3 ac = verts[c] - verts[a];
                if (Vector3.Cross(ab, ac).sqrMagnitude > 1e-12f)
                {
                    valid++;
                }
            }

            if (valid == 0)
            {
                throw new InvalidOperationException(mesh.name + " has no valid triangles.");
            }
        }

        static void AddBox(List<Vector3> verts, List<Vector2> uvs, List<int> tris, Vector3 center, Vector3 size)
        {
            float hx = size.x * 0.5f;
            float hy = size.y * 0.5f;
            float hz = size.z * 0.5f;
            Vector3 p0 = center + new Vector3(-hx, -hy, -hz);
            Vector3 p1 = center + new Vector3(hx, -hy, -hz);
            Vector3 p2 = center + new Vector3(hx, hy, -hz);
            Vector3 p3 = center + new Vector3(-hx, hy, -hz);
            Vector3 p4 = center + new Vector3(-hx, -hy, hz);
            Vector3 p5 = center + new Vector3(hx, -hy, hz);
            Vector3 p6 = center + new Vector3(hx, hy, hz);
            Vector3 p7 = center + new Vector3(-hx, hy, hz);
            AddQuadVerts(verts, uvs, tris, p0, p1, p2, p3);
            AddQuadVerts(verts, uvs, tris, p5, p4, p7, p6);
            AddQuadVerts(verts, uvs, tris, p4, p0, p3, p7);
            AddQuadVerts(verts, uvs, tris, p1, p5, p6, p2);
            AddQuadVerts(verts, uvs, tris, p4, p5, p1, p0);
            AddQuadVerts(verts, uvs, tris, p3, p2, p6, p7);
        }

        static void AddArch(
            List<Vector3> verts,
            List<Vector2> uvs,
            List<int> tris,
            float innerR,
            float outerR,
            float y0,
            float halfZ,
            int segments)
        {
            for (int i = 0; i < segments; i++)
            {
                float a0 = Mathf.PI * i / segments;
                float a1 = Mathf.PI * (i + 1) / segments;
                Vector3 inner0Front = ArchPoint(innerR, y0, a0, -halfZ);
                Vector3 inner1Front = ArchPoint(innerR, y0, a1, -halfZ);
                Vector3 outer0Front = ArchPoint(outerR, y0, a0, -halfZ);
                Vector3 outer1Front = ArchPoint(outerR, y0, a1, -halfZ);
                Vector3 inner0Back = ArchPoint(innerR, y0, a0, halfZ);
                Vector3 inner1Back = ArchPoint(innerR, y0, a1, halfZ);
                Vector3 outer0Back = ArchPoint(outerR, y0, a0, halfZ);
                Vector3 outer1Back = ArchPoint(outerR, y0, a1, halfZ);
                AddQuadVerts(verts, uvs, tris, inner0Front, outer0Front, outer1Front, inner1Front);
                AddQuadVerts(verts, uvs, tris, inner1Back, outer1Back, outer0Back, inner0Back);
                AddQuadVerts(verts, uvs, tris, inner0Back, inner0Front, inner1Front, inner1Back);
                AddQuadVerts(verts, uvs, tris, outer0Front, outer0Back, outer1Back, outer1Front);
            }
        }

        static Vector3 ArchPoint(float radius, float y0, float angle, float z)
        {
            return new Vector3(Mathf.Cos(angle) * radius, y0 + Mathf.Sin(angle) * radius, z);
        }

        static void AddQuadVerts(List<Vector3> verts, List<Vector2> uvs, List<int> tris, Vector3 a, Vector3 b, Vector3 c, Vector3 d)
        {
            int i = verts.Count;
            verts.Add(a);
            verts.Add(b);
            verts.Add(c);
            verts.Add(d);
            uvs.Add(GateUv(a));
            uvs.Add(GateUv(b));
            uvs.Add(GateUv(c));
            uvs.Add(GateUv(d));
            tris.Add(i);
            tris.Add(i + 1);
            tris.Add(i + 2);
            tris.Add(i);
            tris.Add(i + 2);
            tris.Add(i + 3);
        }

        static Vector2 GateUv(Vector3 p)
        {
            return new Vector2(p.x * 0.32f + p.z * 0.11f, p.y * 0.34f + p.z * 0.08f);
        }

        static void AddQuad(List<int> tris, int a, int c, int b, int d)
        {
            tris.Add(a);
            tris.Add(c);
            tris.Add(b);
            tris.Add(b);
            tris.Add(c);
            tris.Add(d);
        }

        static void OrientUp(Mesh mesh)
        {
            mesh.RecalculateNormals();
            if (AverageNormalY(mesh) >= 0f)
            {
                return;
            }

            mesh.triangles = Flipped(mesh.triangles);
            mesh.RecalculateNormals();
        }

        static void OrientUpSubmeshes(Mesh mesh)
        {
            mesh.RecalculateNormals();
            if (AverageNormalY(mesh) >= 0f)
            {
                return;
            }

            for (int i = 0; i < mesh.subMeshCount; i++)
            {
                mesh.SetTriangles(Flipped(mesh.GetTriangles(i)), i);
            }

            mesh.RecalculateNormals();
        }

        static float AverageNormalY(Mesh mesh)
        {
            var normals = mesh.normals;
            float y = 0f;
            int n = Mathf.Min(normals.Length, 64);
            for (int i = 0; i < n; i++)
            {
                y += normals[i].y;
            }

            return y;
        }

        static int[] Flipped(int[] tris)
        {
            var copy = (int[])tris.Clone();
            for (int i = 0; i < copy.Length; i += 3)
            {
                int tmp = copy[i + 1];
                copy[i + 1] = copy[i + 2];
                copy[i + 2] = tmp;
            }

            return copy;
        }

        static Vector3[] SampleCatmull(Vector3[] controls, int perSpan)
        {
            var list = new System.Collections.Generic.List<Vector3>();
            for (int i = 0; i < controls.Length - 1; i++)
            {
                Vector3 p0 = controls[Mathf.Max(i - 1, 0)];
                Vector3 p1 = controls[i];
                Vector3 p2 = controls[i + 1];
                Vector3 p3 = controls[Mathf.Min(i + 2, controls.Length - 1)];
                int steps = i == controls.Length - 2 ? perSpan : perSpan - 1;
                for (int s = 0; s < steps; s++)
                {
                    float t = s / (float)perSpan;
                    list.Add(Catmull(p0, p1, p2, p3, t));
                }
            }

            list.Add(controls[controls.Length - 1]);
            return list.ToArray();
        }

        static Vector3 Catmull(Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3, float t)
        {
            float t2 = t * t;
            float t3 = t2 * t;
            return 0.5f * (
                2f * p1 +
                (-p0 + p2) * t +
                (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2 +
                (-p0 + 3f * p1 - 3f * p2 + p3) * t3);
        }

        static bool IsFinite(Vector3 v)
        {
            return !(float.IsNaN(v.x) || float.IsNaN(v.y) || float.IsNaN(v.z) ||
                     float.IsInfinity(v.x) || float.IsInfinity(v.y) || float.IsInfinity(v.z));
        }
    }
}
