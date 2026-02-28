<!-- omit in toc -->
# Contributing to Tutti Belli

First off, thanks for taking the time to contribute! ❤️

All types of contributions are encouraged and valued. See the [Table of Contents](#table-of-contents) for different ways to help and details about how this project handles them. Please make sure to read the relevant section before making your contribution. It will make it a lot easier for us maintainers and smooth out the experience for all involved. The community looks forward to your contributions. 🎉

> And if you like the project, but just don't have time to contribute, that's fine. There are other easy ways to support the project and show your appreciation, which we would also be very happy about:
> - Star the project
> - Tweet about it
> - Refer this project in your project's readme
> - Mention the project at local meetups and tell your friends/colleagues

<!-- omit in toc -->
## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [I Have a Question](#i-have-a-question)
  - [I Want To Contribute](#i-want-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Your First Code Contribution](#your-first-code-contribution)
  - [Improving The Documentation](#improving-the-documentation)
- [Styleguides](#styleguides)
  - [Commit Messages](#commit-messages)
- [Join The Project Team](#join-the-project-team)


## Code of Conduct

This project and everyone participating in it is governed by the
[Tutti Belli Code of Conduct](https://github.com/lanesawyer/tutti-belli/blob/main/CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code. Please report unacceptable behavior
to <github@lanesawyer.dev>.


## I Have a Question

> If you want to ask a question, we assume that you have read the available [Documentation](https://github.com/lanesawyer/tutti-belli).

Before you ask a question, it is best to search for existing [Issues](https://github.com/lanesawyer/tutti-belli/issues) that might help you. In case you have found a suitable issue and still need clarification, you can write your question in this issue. It is also advisable to search the internet for answers first.

If you then still feel the need to ask a question and need clarification, we recommend the following:

- Open an [Issue](https://github.com/lanesawyer/tutti-belli/issues/new).
- Provide as much context as you can about what you're running into.
- Provide project and platform versions (nodejs, npm, etc), depending on what seems relevant.

We will then take care of the issue as soon as possible.

<!--
You might want to create a separate issue tag for questions and include it in this description. People should then tag their issues accordingly.

Depending on how large the project is, you may want to outsource the questioning, e.g. to Stack Overflow or Gitter. You may add additional contact and information possibilities:
- IRC
- Slack
- Gitter
- Stack Overflow tag
- Blog
- FAQ
- Roadmap
- E-Mail List
- Forum
-->

## I Want To Contribute

> ### Legal Notice <!-- omit in toc -->
> When contributing to this project, you must agree that you have authored 100% of the content, that you have the necessary rights to the content and that the content you contribute may be provided under the project license.

### Reporting Bugs

<!-- omit in toc -->
#### Before Submitting a Bug Report

A good bug report shouldn't leave others needing to chase you up for more information. Therefore, we ask you to investigate carefully, collect information and describe the issue in detail in your report. Please complete the following steps in advance to help us fix any potential bug as fast as possible.

- Make sure that you are using the latest version.
- Determine if your bug is really a bug and not an error on your side e.g. using incompatible environment components/versions (Make sure that you have read the [documentation](https://github.com/lanesawyer/tutti-belli). If you are looking for support, you might want to check [this section](#i-have-a-question)).
- To see if other users have experienced (and potentially already solved) the same issue you are having, check if there is not already a bug report existing for your bug or error in the [bug tracker](https://github.com/lanesawyer/tutti-belli/issues?q=label%3Abug).
- Also make sure to search the internet (including Stack Overflow) to see if users outside of the GitHub community have discussed the issue.
- Collect information about the bug:
  - Stack trace (Traceback)
  - OS, Platform and Version (Windows, Linux, macOS, x86, ARM)
  - Version of the interpreter, compiler, SDK, runtime environment, package manager, depending on what seems relevant.
  - Possibly your input and the output
  - Can you reliably reproduce the issue? And can you also reproduce it with older versions?

<!-- omit in toc -->
#### How Do I Submit a Good Bug Report?

> You must never report security related issues, vulnerabilities or bugs including sensitive information to the issue tracker, or elsewhere in public. Instead sensitive bugs must be sent by email to <github@lanesawyer.dev>.
<!-- You may add a PGP key to allow the messages to be sent encrypted as well. -->

We use GitHub issues to track bugs and errors. If you run into an issue with the project:

- Open an [Issue](https://github.com/lanesawyer/tutti-belli/issues/new). (Since we can't be sure at this point whether it is a bug or not, we ask you not to talk about a bug yet and not to label the issue.)
- Explain the behavior you would expect and the actual behavior.
- Please provide as much context as possible and describe the *reproduction steps* that someone else can follow to recreate the issue on their own. This usually includes your code. For good bug reports you should isolate the problem and create a reduced test case.
- Provide the information you collected in the previous section.

Once it's filed:

- The project team will label the issue accordingly.
- A team member will try to reproduce the issue with your provided steps. If there are no reproduction steps or no obvious way to reproduce the issue, the team will ask you for those steps and mark the issue as `needs-repro`. Bugs with the `needs-repro` tag will not be addressed until they are reproduced.
- If the team is able to reproduce the issue, it will be marked `needs-fix`, as well as possibly other tags (such as `critical`), and the issue will be left to be [implemented by someone](#your-first-code-contribution).

When filing a bug report, please use the [Bug Report issue template](https://github.com/lanesawyer/tutti-belli/issues/new?template=bug_report.md), which will prompt you for all of the information listed above.


### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion for Tutti Belli, **including completely new features and minor improvements to existing functionality**. Following these guidelines will help maintainers and the community to understand your suggestion and find related suggestions.

<!-- omit in toc -->
#### Before Submitting an Enhancement

- Make sure that you are using the latest version.
- Read the [documentation](https://github.com/lanesawyer/tutti-belli) carefully and find out if the functionality is already covered, maybe by an individual configuration.
- Perform a [search](https://github.com/lanesawyer/tutti-belli/issues) to see if the enhancement has already been suggested. If it has, add a comment to the existing issue instead of opening a new one.
- Find out whether your idea fits with the scope and aims of the project. It's up to you to make a strong case to convince the project's developers of the merits of this feature. Keep in mind that we want features that will be useful to the majority of our users and not just a small subset. If you're just targeting a minority of users, consider writing an add-on/plugin library.

<!-- omit in toc -->
#### How Do I Submit a Good Enhancement Suggestion?

Enhancement suggestions are tracked as [GitHub issues](https://github.com/lanesawyer/tutti-belli/issues).

- Use a **clear and descriptive title** for the issue to identify the suggestion.
- Provide a **step-by-step description of the suggested enhancement** in as many details as possible.
- **Describe the current behavior** and **explain which behavior you expected to see instead** and why. At this point you can also tell which alternatives do not work for you.
- You may want to **include screenshots or screen recordings** which help you demonstrate the steps or point out the part which the suggestion is related to. You can use [LICEcap](https://www.cockos.com/licecap/) to record GIFs on macOS and Windows, and the built-in [screen recorder in GNOME](https://help.gnome.org/users/gnome-help/stable/screen-shot-record.html.en) or [SimpleScreenRecorder](https://github.com/MaartenBaert/ssr) on Linux.
- **Explain why this enhancement would be useful** to most Tutti Belli users. You may also want to point out the other projects that solved it better and which could serve as inspiration.

When submitting an enhancement suggestion, please use the [Feature Request issue template](https://github.com/lanesawyer/tutti-belli/issues/new?template=feature_request.md), which will prompt you for all of the information listed above.

### Your First Code Contribution

To get the project running locally:

1. **Install prerequisites**: [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/)
2. **Clone the repo** and install dependencies:
   ```bash
   git clone https://github.com/lanesawyer/tutti-belli.git
   cd tutti-belli
   pnpm install
   ```
3. **Set up environment variables**: Copy `.env.example` to `.env` and fill in the required values. For local development, the database variables can be left as-is — the app uses a local SQLite file automatically.
4. **Start the dev server**:
   ```bash
   pnpm dev
   ```
   The app will be available at `http://localhost:4321`. Local dev auto-seeds the database with sample data including an admin account (`admin@example.com` / `admin123`) and a test user (`test@example.com` / `test123`).
5. **Run the tests** to make sure everything is working:
   ```bash
   pnpm test
   ```

From there, pick an issue tagged `good first issue` on the [issue tracker](https://github.com/lanesawyer/tutti-belli/issues), create a branch, and open a pull request when you're ready for review.

### Improving The Documentation

Documentation improvements are a great way to contribute — especially if you're new to the codebase. If you notice something that's outdated, unclear, or missing, please open a PR to fix it. Even small corrections (typos, broken links, confusing wording) are welcome and valuable.

## Styleguides
### Commit Messages

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification. Conventional Commits is a lightweight convention on top of commit messages that provides a structured format for describing what changed and why. Each commit message should look like:

```
<type>(<optional scope>): <short description>
```

Common types include `feat` (new feature), `fix` (bug fix), `docs` (documentation), `refactor`, and `test`. For example: `feat(attendance): add bulk mark-present button`.

## Join The Project Team

Regular contributors who consistently submit quality PRs and engage constructively with the project will be invited to take on a larger role — including repository write access, helping triage issues, and shaping the direction of the project. If you're interested in getting more involved, the best way is to keep contributing and let your work speak for itself.

<!-- omit in toc -->
## Attribution
This guide is based on the **contributing-gen**. [Make your own](https://github.com/bttger/contributing-gen)!
