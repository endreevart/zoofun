"""Owner lab: three image models × two still prompts. Mesh on demand."""

from __future__ import annotations

from dataclasses import dataclass

from app.providers.openrouter import CONTOUR_PROMPT

# Lab-only. Doodle anatomy, living surface (feathers/hide/fur). Not a felt toy.
ALIVE_PROMPT = (
    "This is a child's drawing of one zoo creature. Treat it as a character model sheet. "
    "Keep that exact silhouette, proportions, limb count, extra parts, colors, marks, "
    "and asymmetry. If the head is a wide oval, keep the wide oval. "
    "If one eye is bigger, keep it bigger. A bird stays that bird. "
    "Do not invent a different species. Do not symmetrize. "
    "Do not turn the body into a sphere, a potato, a mascot, or a catalog animal. "
    "Photograph the doodle as a living creature in macro, not as a toy. "
    "The skin is real for this animal: individual feather barbs and speckles, "
    "or wrinkled hide, or dense fur with follicles — stretched over the child's shapes. "
    "Eyes are wet glassy orbs, not felt circles, not plastic beads, not painted dots. "
    "Beak, claws, teeth, and horns are real keratin or ivory. "
    "Forbidden: felt, needle-felt, flocking, plush, velvet, clay, plastic, "
    "designer toy, merch, kawaii mascot, smooth flocked figurine. "
    "Soft cinematic light, bright rim light in the feathers or fur. "
    "Three-quarter view, about forty degrees off the front. "
    "Full body, centered, standing. One creature. "
    "No scenery, no ground, no jungle, no plants, no props, no drop shadow. "
    "Transparent background."
)


@dataclass(frozen=True)
class LabModel:
    id: str
    slug: str
    title: str
    extras: dict


@dataclass(frozen=True)
class LabPrompt:
    id: str
    title: str
    why: str
    text: str


@dataclass(frozen=True)
class LabMesh:
    id: str
    title: str
    group: str
    payload: dict
    chosen: bool = False
    fallback: bool = False
    provider: str = "meshy"


@dataclass(frozen=True)
class LabRecipe:
    id: str
    model: LabModel
    prompt: LabPrompt


LAB_MODELS: tuple[LabModel, ...] = (
    LabModel(
        id="flux2",
        slug="black-forest-labs/flux.2-pro",
        title="FLUX.2 Pro",
        extras={"output_format": "png"},
    ),
    LabModel(
        id="seedream",
        slug="bytedance-seed/seedream-5-0-pro",
        title="Seedream 5 Pro",
        extras={},
    ),
    LabModel(
        id="gemini25",
        slug="google/gemini-2.5-flash-image",
        title="Nano Banana",
        extras={"output_format": "png", "background": "transparent"},
    ),
)

LAB_PROMPTS: tuple[LabPrompt, ...] = (
    LabPrompt(
        id="contour",
        title="Контур как на рисунке",
        why="Прод-промпт: силуэт ребёнка, потом глина и фетр.",
        text=CONTOUR_PROMPT,
    ),
    LabPrompt(
        id="alive",
        title="Живой чудик",
        why="Силуэт рисунка, живые перья или шкура. Не фетровая игрушка. Без пейзажа.",
        text=ALIVE_PROMPT,
    ),
)

MESH_PRESETS: tuple[LabMesh, ...] = (
    LabMesh(
        id="meshy-7",
        title="Meshy 7",
        group="Meshy",
        payload={
            "ai_model": "meshy-7",
            "model_type": "standard",
            "should_remesh": True,
            "image_enhancement": True,
            "target_polycount": 20_000,
        },
    ),
    LabMesh(
        id="tripo-v31",
        title="Tripo 3.1",
        group="Tripo",
        payload={"model": "v3.1-20260211"},
        provider="tripo",
    ),
    LabMesh(
        id="tripo-v30",
        title="Tripo 3.0",
        group="Tripo",
        payload={"model": "v3.0-20250812"},
        provider="tripo",
        chosen=True,
    ),
    LabMesh(
        id="tripo-v25",
        title="Tripo 2.5",
        group="Tripo",
        payload={"model": "v2.5-20250123"},
        provider="tripo",
        fallback=True,
    ),
    LabMesh(
        id="studio-trellis2",
        title="TRELLIS.2",
        group="3D AI Studio",
        payload={"kind": "trellis2"},
        provider="studio3d",
    ),
    LabMesh(
        id="studio-hy-rapid",
        title="Hunyuan Rapid",
        group="3D AI Studio",
        payload={"kind": "hunyuan-rapid"},
        provider="studio3d",
    ),
    LabMesh(
        id="studio-hy-pro31",
        title="Hunyuan Pro 3.1",
        group="3D AI Studio",
        payload={"kind": "hunyuan-pro", "hunyuan_model": "3.1"},
        provider="studio3d",
    ),
    LabMesh(
        id="studio-hy-pro30",
        title="Hunyuan Pro 3.0",
        group="3D AI Studio",
        payload={"kind": "hunyuan-pro", "hunyuan_model": "3.0"},
        provider="studio3d",
    ),
    LabMesh(
        id="studio-tripo-31",
        title="Studio Tripo 3.1",
        group="3D AI Studio",
        payload={"kind": "tripo", "tripo_version": "3.1"},
        provider="studio3d",
    ),
    LabMesh(
        id="studio-tripo-30",
        title="Studio Tripo 3.0",
        group="3D AI Studio",
        payload={"kind": "tripo", "tripo_version": "3.0"},
        provider="studio3d",
    ),
    LabMesh(
        id="studio-tripo-p1",
        title="Studio Tripo P1",
        group="3D AI Studio",
        payload={"kind": "tripo", "tripo_version": "p1"},
        provider="studio3d",
    ),
    LabMesh(
        id="fal-trellis2",
        title="fal TRELLIS-2",
        group="fal.ai",
        payload={"fal_model": "trellis-2"},
        provider="fal",
    ),
    LabMesh(
        id="fal-trellis",
        title="fal TRELLIS",
        group="fal.ai",
        payload={"fal_model": "trellis"},
        provider="fal",
    ),
    LabMesh(
        id="fal-hy-rapid",
        title="fal Hunyuan Rapid",
        group="fal.ai",
        payload={"fal_model": "hunyuan-rapid"},
        provider="fal",
    ),
    LabMesh(
        id="fal-hy-pro",
        title="fal Hunyuan Pro",
        group="fal.ai",
        payload={"fal_model": "hunyuan-pro"},
        provider="fal",
    ),
)


def card_id(model_id: str, prompt_id: str) -> str:
    return f"{model_id}__{prompt_id}"


def all_recipes() -> tuple[LabRecipe, ...]:
    return tuple(
        LabRecipe(id=card_id(model.id, prompt.id), model=model, prompt=prompt)
        for prompt in LAB_PROMPTS
        for model in LAB_MODELS
    )


RECIPES = all_recipes()
RECIPE_BY_ID = {recipe.id: recipe for recipe in RECIPES}
MESH_BY_ID = {preset.id: preset for preset in MESH_PRESETS}


def catalog() -> dict:
    return {
        "models": [{"id": m.id, "slug": m.slug, "title": m.title} for m in LAB_MODELS],
        "prompts": [{"id": p.id, "title": p.title, "why": p.why, "text": p.text} for p in LAB_PROMPTS],
        "meshes": [
            {
                "id": m.id,
                "title": m.title,
                "group": m.group,
                "chosen": m.chosen,
                "fallback": m.fallback,
                "provider": m.provider,
                "payload": dict(m.payload),
            }
            for m in MESH_PRESETS
        ],
    }


def recipe_public(recipe: LabRecipe) -> dict:
    return {
        "id": recipe.id,
        "title": f"{recipe.model.title} · {recipe.prompt.title}",
        "why": recipe.prompt.why,
        "model_id": recipe.model.id,
        "model_slug": recipe.model.slug,
        "prompt_id": recipe.prompt.id,
        "prompt": recipe.prompt.text,
    }
