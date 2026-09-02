using UnityEngine;

namespace VirtualZoo.Presentation
{
    public interface ICreatureVisual
    {
        Transform VisualRoot { get; }
        void SetDeformation(float squashY, float stretchX);
        void SetFacing(float facing);
    }
}
