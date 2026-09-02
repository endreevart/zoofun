using NUnit.Framework;
using UnityEngine;
using VirtualZoo.Presentation;

namespace VirtualZoo.Tests.EditMode
{
    public sealed class GardenMeshFactoryTests
    {
        [Test]
        public void Meadow_mesh_is_valid_and_continuous()
        {
            var mesh = GardenMeshFactory.CreateMeadow(new Vector3(-3.1f, 0f, 1.35f), new Vector2(1.85f, 1.45f));
            GardenMeshFactory.Validate(mesh);
            Assert.That(mesh.vertexCount, Is.GreaterThan(100));
            Assert.That(mesh.triangles.Length, Is.GreaterThan(300));
        }

        [Test]
        public void Path_ribbon_mesh_is_valid()
        {
            var mesh = GardenMeshFactory.CreatePathRibbon(1.18f, 0.038f);
            GardenMeshFactory.Validate(mesh);
            Assert.That(mesh.vertexCount, Is.GreaterThan(20));
        }

        [Test]
        public void Water_and_bank_meshes_are_valid()
        {
            var center = new Vector3(-3.1f, 0f, 1.35f);
            var extents = new Vector2(1.85f, 1.45f);
            GardenMeshFactory.Validate(GardenMeshFactory.CreateWater(center, extents, 0.04f));
            GardenMeshFactory.Validate(GardenMeshFactory.CreateBank(center, extents * 0.98f, extents + Vector2.one * 0.72f, 0.032f, 0.026f));
            GardenMeshFactory.Validate(GardenMeshFactory.CreateIrregularWater(center, extents, 0.05f, 1f));
            GardenMeshFactory.Validate(GardenMeshFactory.CreateIrregularBank(center, extents, 0.96f, 0.9f, -0.04f, 0.02f));
            GardenMeshFactory.Validate(GardenMeshFactory.CreateDirtPath(1.3f, 0.02f, GardenMeshFactory.PathControlPoints()));
            var blended = GardenMeshFactory.CreateBlendedDirtPath(1.4f, 0.018f, GardenMeshFactory.PathControlPoints());
            GardenMeshFactory.Validate(blended);
            Assert.That(blended.subMeshCount, Is.EqualTo(2));
        }

        [Test]
        public void Story_gate_is_a_grounded_arch_with_depth()
        {
            var mesh = GardenMeshFactory.CreateStoryGate();
            GardenMeshFactory.Validate(mesh);
            Assert.That(mesh.bounds.min.y, Is.LessThan(0.05f));
            Assert.That(mesh.bounds.size.x, Is.GreaterThan(4.2f));
            Assert.That(mesh.bounds.size.y, Is.GreaterThan(2.8f));
            Assert.That(mesh.bounds.size.z, Is.GreaterThan(0.7f));
            var verts = mesh.vertices;
            for (int i = 0; i < verts.Length; i++)
            {
                Vector3 v = verts[i];
                bool inOpening = Mathf.Abs(v.x) < 0.85f && v.y > 0.12f && v.y < 1.55f && Mathf.Abs(v.z) < 0.55f;
                Assert.That(inOpening, Is.False, "Gate mesh blocks the opening at " + v);
            }

            var plinth = GardenMeshFactory.CreateStonePlinth();
            GardenMeshFactory.Validate(plinth);
            Assert.That(plinth.bounds.size.y, Is.GreaterThan(0.8f));
            Assert.That(plinth.bounds.min.y, Is.LessThan(0.05f));
        }
    }
}
