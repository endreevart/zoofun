using NUnit.Framework;
using UnityEngine;
using VirtualZoo.Presentation;

namespace VirtualZoo.Tests.EditMode
{
    public sealed class ZooCameraRigTests
    {
        [Test]
        public void Hero_camera_stays_on_one_pitch_and_only_pans_horizontally()
        {
            var root = new GameObject("Rig");
            var camGo = new GameObject("Cam");
            camGo.transform.SetParent(root.transform, false);
            var camera = camGo.AddComponent<Camera>();
            var rig = root.AddComponent<ZooCameraRig>();
            Vector3 eye = IdyllicLayout.HeroCamera;
            Vector3 focus = IdyllicLayout.HeroFocus;
            rig.ConfigureCinematic(camera, eye, focus, new Vector2(2.4f, 2.4f));

            float pitch = Pitch(camera);
            float height = camera.transform.position.y;
            Vector3 before = rig.FocusPoint;

            rig.PanPixels(new Vector2(80f, 120f));

            Assert.That(rig.FocusPoint.z, Is.EqualTo(before.z).Within(0.001f));
            Assert.That(rig.FocusPoint.y, Is.EqualTo(focus.y).Within(0.001f));
            Assert.That(rig.FocusPoint.x, Is.Not.EqualTo(before.x).Within(0.001f));
            Assert.That(camera.transform.position.y, Is.EqualTo(height).Within(0.02f));
            Assert.That(Pitch(camera), Is.EqualTo(pitch).Within(0.35f));

            Object.DestroyImmediate(root);
        }

        static float Pitch(Camera camera)
        {
            Vector3 forward = camera.transform.forward;
            Vector3 flat = new Vector3(forward.x, 0f, forward.z);
            if (flat.sqrMagnitude < 0.0001f)
            {
                return 90f;
            }

            return Mathf.Atan2(-forward.y, flat.magnitude) * Mathf.Rad2Deg;
        }
    }
}
