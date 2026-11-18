"""Inert Hermes plugin adapter for the Law-only lume_timing_run tool (experimental, synthetic prototype).
register(ctx) adds one tool in its own toolset. With no injected Config the handler answers not_configured and the tool stays hidden."""
from .contract import SCHEMA, TOOL_NAME, TOOLSET
from .runner import Runner


def register(ctx, runner=None):
    runner = runner or Runner(None)
    ctx.register_tool(
        name=TOOL_NAME,
        toolset=TOOLSET,
        schema=SCHEMA,
        handler=runner.handle,
        check_fn=runner.active,
        description=SCHEMA["description"],
        override=False,
    )
