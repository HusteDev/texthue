# Run the roster example in a clean project

Use **resolve** for a username badge that must keep its colors across applications. Use **assign** for a board where you know which users appear together and want their colors spaced apart. **Save the registry** when later versions of the board must keep earlier placements. Save its matching configuration alongside it.

Each example accepts the currently visible usernames on the command line. On its first run it creates a resolver with the namespace `assignees`. On later runs it reads `roster.json`, restores the resolver, and passes the saved placements into assignment. It writes the updated snapshot after each run. A user who leaves the board keeps their reserved placement.

## Set up a clean consumer

Start in a directory containing a checkout named `texthue`. Each quickstart creates a sibling project so the example resolves its installed dependency independently of the checkout. These commands use the source and local distribution files for version 0.1.0. No registry release is required. Use a fresh destination for each walkthrough.

The commands below use a POSIX shell. In PowerShell, replace `cp -R SOURCE DEST` with `Copy-Item -Recurse SOURCE DEST`. Commands that run a virtual environment use the Windows interpreter path shown in the Python section.

### JavaScript and TypeScript

Use Node.js 22+ to build the package. From the directory containing the checkout:

```sh
cp -R texthue/examples/roster/javascript roster-js
cd texthue
npm ci
npm pack --workspace texthue --pack-destination ../roster-js
cd ../roster-js
npm init -y
npm install ./texthue-0.1.0.tgz
node roster.mjs "@mira" "@lee"
node roster.mjs "@mira" "@nico"
node roster.mjs "@lee" "@nico" "@mira"
```

For TypeScript, use the same installed tarball. The typed entry point shares the roster logic with JavaScript. Run it from the compiled directory so it starts with its own empty roster.

```sh
npm install --save-dev typescript@7.0.2
npx tsc -p tsconfig.json
cd compiled
node typed.mjs "@mira" "@lee"
node typed.mjs "@mira" "@nico"
node typed.mjs "@lee" "@nico" "@mira"
```

[Resolver and assignment calls](javascript/palette.mjs) · [Local persistence](javascript/cli.mjs) · [Typed entry point](javascript/typed.mts)

### Python

Use Python 3.11+. From the directory containing the checkout, build a wheel and install it into a fresh virtual environment. On Windows, use `.venv/Scripts/python.exe` in place of `.venv/bin/python` below.

```sh
cp -R texthue/examples/roster/python roster-python
cd roster-python
python -m venv .venv
.venv/bin/python -m pip wheel --no-deps ../texthue/packages/python --wheel-dir wheels
.venv/bin/python -m pip install --no-index --find-links wheels texthue==0.1.0
.venv/bin/python roster.py "@mira" "@lee"
.venv/bin/python roster.py "@mira" "@nico"
.venv/bin/python roster.py "@lee" "@nico" "@mira"
```

[Python roster program](python/roster.py)

### Go

Use Go 1.23+. From the directory containing the checkout, create a separate consumer module. The replacement selects the local TextHue module for this unreleased checkout. Vendoring copies its used packages and dependencies into the consumer before the build.

```sh
cp -R texthue/examples/roster/go roster-go
cd roster-go
go mod init example.com/roster
go mod edit -replace=github.com/HusteDev/texthue/packages/go=../texthue/packages/go
go mod tidy
go mod vendor
go build -mod=vendor -o roster .
./roster "@mira" "@lee"
./roster "@mira" "@nico"
./roster "@lee" "@nico" "@mira"
```

On Windows, build with `-o roster.exe` and run `.\roster.exe`. [Go roster program](go/main.go)

## Read the results

Each line prints **username, independent badge fill, badge lettering, assigned board fill**. These are the light-theme results for all three languages.

| Run | What to look for |
| --- | --- |
| 1. Mira and Lee join | Mira’s badge and board fills are both `#a79de9`. Lee’s independent badge fill is `#dbb2ee`; assignment gives Lee `#cfc163` on this board. Both badges use black lettering. |
| 2. Lee leaves and Nico joins | The command starts a new process and reads the snapshot. Mira keeps her board fill. Nico gets `#5ec3a5`. Lee is absent from the printed rows and still present in the saved registry. |
| 3. Lee returns | Lee gets the same board fill as in run 1, even though the membership and order changed. The final output is shown below. |

```text
@lee #dbb2ee #000000 #cfc163
@nico #ec9d89 #000000 #5ec3a5
@mira #a79de9 #000000 #a79de9
```

The example stores one local snapshot per working directory. Run it in a new directory for a new board. For dark-mode badges, read both `fill` and `onFill` from the dark theme. [Resolver walkthrough](https://github.com/HusteDev/texthue/wiki/Configure-your-first-resolver)
