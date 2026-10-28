# Contributing to GDPSnode

Contributions are welcome. This project is built by people extending and improving the community Geometry Dash server ecosystem, so clear patches, tests, and documentation updates are always appreciated!

## Before you start

- Make sure you have the project set up locally using the instructions in [SETUP.md](SETUP.md).
- Read the [contributor reference](CONTRIBUTOR_REFERENCE.md) before changing configuration, protocol fields, numeric flags, or status values.
- Check the issue tracker or open a discussion before starting on a large feature.
- Keep changes focused and avoid unrelated refactors in the same pull request.

## Recommended workflow

1. Fork the repository.
2. Create a feature branch.
3. Make the change and keep commit messages descriptive.
4. Run the validation commands.
5. Update documentation when behavior or setup changes.
6. Open a pull request with a clear summary.

## Local validation

Run the project’s syntax validation:

```sh
npm test
```

This checks the core server script and dashboard files for JavaScript errors.

## Adding features

If you add new endpoints, dashboard flows, config settings, or plugin APIs:

- document the new behavior in the relevant docs
- update the [contributor reference](CONTRIBUTOR_REFERENCE.md) when adding or changing shared configuration, protocol sentinels, or numeric state meanings
- update the example `.env` file if needed
- make sure the route is compatible with the existing Geometry Dash client protocol
- avoid breaking older behavior unless the change is intentionally breaking

## Plugin contributions

If you are contributing a plugin or extension:

- place it in the `plugins/` directory or a subfolder with `index.js`
- include a clear `name` and metadata block
- document expected hooks or route paths in the plugin comments or README
- prefer simple, modular plugin boundaries

## Documentation updates

If you change setup steps, configuration keys, plugin APIs, or server behavior:

- update the README
- update the relevant doc in `docs/`
- update examples where needed

## Commit expectations

Keep commits easy to review:

- one concern per commit when practical
- descriptive messages
- no accidental debug logs or unrelated file churn

## Pull request checklist

Before opening a PR, confirm that:

- the server still starts locally
- the syntax checks pass
- the docs reflect the new behavior
- the patch is scoped to the requested feature or bugfix
- no unrelated files were touched

## Questions

Open an issue if you need clarification on architecture, a planned feature, or contributor expectations.

## Related docs

- [First steps and setup](SETUP.md)
- [GDPS Switcher setup](GDPS_SWITCHER.md)
- [Hooks and plugin development](PLUGIN_DEVELOPMENT.md)
