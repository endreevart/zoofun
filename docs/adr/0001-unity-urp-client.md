# ADR-0001: Unity 6.3 LTS with URP

- Status: accepted
- Date: 2026-08-25

## Context

The core experience needs a stylized 3D zoo, camera exploration, autonomous creature navigation, particles, shaders, and runtime-loaded 2.5D residents across iPhone, iPad, and macOS.

## Decision

Use Unity 6.3 LTS, C#, and URP as the primary client. Use a narrow native Apple bridge for camera/photo picker and parental authentication. StoreKit 2 is deferred/post-pilot.

## Consequences

- The world and visual behavior use mature game tooling and NavMesh navigation.
- Apple APIs require a maintained bridge and Xcode build validation.
- Beautiful output still requires art direction, authored assets, lighting, and device profiling.
- Unity package versions are locked by the project, not copied from online examples.

## Rejected alternatives

- Full SwiftUI/RealityKit: stronger Apple integration but more custom game/editor work and currently beta navigation APIs.
- Godot: viable, but higher Apple integration and C# iOS risk for this project.
- Unreal: capable but unnecessary mobile/runtime complexity for the stylized MVP.
