using NUnit.Framework;
using UnityEngine;
using VirtualZoo.Domain;
using VirtualZoo.Presentation;

namespace VirtualZoo.Tests.EditMode
{
    public sealed class IdyllicGardenLayoutTests
    {
        [Test]
        public void Camera_uses_cinematic_perspective_not_top_down()
        {
            Assert.That(IdyllicLayout.CameraFov, Is.InRange(30f, 36f));
            Assert.That(IdyllicLayout.CameraPitchDegrees(), Is.InRange(24f, 30f));
            Assert.That(IdyllicLayout.HeroCamera.y, Is.InRange(3.9f, 6.2f));
            Assert.That(IdyllicLayout.HeroCamera.z, Is.LessThan(IdyllicLayout.HeroFocus.z - 5.5f));
            Assert.That(IdyllicLayout.HeroCamera.y, Is.LessThan(IdyllicLayout.HeroFocus.y + 4.2f));
            Assert.That(Mathf.Abs(IdyllicLayout.HeroCamera.x - IdyllicLayout.HeroFocus.x), Is.LessThan(0.5f));
        }

        [Test]
        public void Hero_view_is_a_single_locked_angle_not_a_free_orbit()
        {
            Assert.That(IdyllicLayout.CameraPitchDegrees(), Is.InRange(24f, 30f));
            Vector3 offset = IdyllicLayout.HeroFocus - IdyllicLayout.HeroCamera;
            Assert.That(offset.z, Is.GreaterThan(6.5f));
            Assert.That(Mathf.Abs(offset.x), Is.LessThan(0.5f));
        }

        [Test]
        public void Locomotion_maps_to_habitat_zones_not_vendor_object_names()
        {
            Assert.That(IdyllicLayout.ZoneKindFor(LocomotionClass.Walk), Is.EqualTo(HabitatKind.Ground));
            Assert.That(IdyllicLayout.ZoneKindFor(LocomotionClass.Hop), Is.EqualTo(HabitatKind.Hop));
            Assert.That(IdyllicLayout.ZoneKindFor(LocomotionClass.Fly), Is.EqualTo(HabitatKind.Flight));
            Assert.That(IdyllicLayout.ZoneKindFor(LocomotionClass.Float), Is.EqualTo(HabitatKind.Water));
        }

        [Test]
        public void Working_scene_is_authored_idyllic_garden()
        {
            Assert.That(IdyllicLayout.SceneName, Is.EqualTo("ZooIdyllicGarden"));
            Assert.That(IdyllicLayout.ScenePath, Is.EqualTo("Assets/VirtualZoo/Scenes/ZooIdyllicGarden.unity"));
            Assert.That(IdyllicLayout.VendorRoot, Is.EqualTo("Assets/Idyllic Fantasy Nature"));
            Assert.That(IdyllicLayout.VendorVersion, Is.EqualTo("1.0"));
            Assert.That(IdyllicLayout.VendorProductId, Is.EqualTo("260042"));
        }

        [Test]
        public void Pond_and_path_are_compact_garden_not_ocean()
        {
            Assert.That(IdyllicLayout.PondExtents.x, Is.LessThan(5f));
            Assert.That(IdyllicLayout.PondExtents.y, Is.LessThan(4f));
            Assert.That(IdyllicLayout.PathControlPoints().Length, Is.GreaterThanOrEqualTo(6));
            Assert.That(IdyllicLayout.WaterHeight, Is.GreaterThan(0.04f));
            Assert.That(IdyllicLayout.PondCenter.x, Is.LessThan(-1.4f));
            Assert.That(IdyllicLayout.MeadowExtent, Is.LessThan(28f));
        }

        [Test]
        public void Path_leads_to_gate_behind_the_pond()
        {
            Vector3[] path = IdyllicLayout.PathControlPoints();
            Vector3 last = path[path.Length - 1];
            float gateDist = Vector2.Distance(
                new Vector2(last.x, last.z),
                new Vector2(IdyllicLayout.GatePosition.x, IdyllicLayout.GatePosition.z));
            Assert.That(gateDist, Is.LessThan(1.4f));
            Assert.That(IdyllicLayout.GatePosition.z, Is.GreaterThan(IdyllicLayout.PondCenter.z + 4f));
            Assert.That(IdyllicLayout.MeadowExtent, Is.GreaterThan(IdyllicLayout.GatePosition.z + 12f));
        }

        [Test]
        public void Vendor_demo_scene_is_not_an_editor_build_scene()
        {
            var scenes = UnityEditor.EditorBuildSettings.scenes;
            for (int i = 0; i < scenes.Length; i++)
            {
                Assert.That(scenes[i].path.Contains("Idyllic Fantasy Nature/Demo"), Is.False, scenes[i].path);
            }
        }
    }
}
