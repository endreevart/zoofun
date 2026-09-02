using UnityEngine;

namespace VirtualZoo.Presentation
{
    public sealed class WaterMotion : MonoBehaviour
    {
        Vector3 _base;
        float _amount = 0.008f;
        float _speed = 0.42f;

        public void Configure(float amount, float speed)
        {
            _amount = amount;
            _speed = speed;
        }

        void Awake()
        {
            _base = transform.localPosition;
        }

        void Update()
        {
            float wave = Mathf.Sin(Time.time * _speed);
            transform.localPosition = _base + new Vector3(0f, wave * _amount, 0f);
        }
    }
}
