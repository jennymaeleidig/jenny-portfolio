# Bash 3.2 compatibility floor

The build scripts run under `#!/usr/bin/env bash`, and a stock macOS still
ships bash 3.2. The shared shell modules therefore stay within bash 3.2: no
associative arrays and no `nameref`. Vocabulary tables are `"value=Label"`
strings behind `vocabulary_has` / `vocabulary_label`, and loaded frontmatter is
a `key<TAB>value` record stream read into locals, rather than a keyed map. The
accessors hide the representation, so taking a bash 4 floor later means changing
the tables and loaders, not the call sites.
