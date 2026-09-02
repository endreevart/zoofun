using System.Collections.Generic;

namespace VirtualZoo.Application
{
    public interface IFixtureCatalog
    {
        IReadOnlyList<LoadedFixture> LoadValidFixtures();
    }
}
