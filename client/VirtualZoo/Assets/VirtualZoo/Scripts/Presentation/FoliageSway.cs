using UnityEngine;

namespace VirtualZoo.Presentation
{
    public sealed class FoliageSway : MonoBehaviour
    {
        [SerializeField] float _amount = 2.4f;
        [SerializeField] float _speed = 1.05f;
        [SerializeField] float _phase;

        Quaternion _base;

        public void Configure(float amount, float speed, float phase)
        {
            _amount = amount;
            _speed = speed;
            _phase = phase;
        }

        void Awake()
        {
            _base = transform.localRotation;
        }

        void LateUpdate()
        {
            float wave = Mathf.Sin(Time.time * _speed + _phase);
            transform.localRotation = _base * Quaternion.Euler(wave * _amount * 0.35f, wave * _amount, 0f);
        }
    }
}
