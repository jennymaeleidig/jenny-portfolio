# Career files

`/work/career/` renders `content/career/` directly: what is in the directory is
the page. One file per entry, in four sections, each with its own route:

| section      | path                           | route                        |
| ------------ | ------------------------------ | ---------------------------- |
| Experience   | `content/career/experience/`   | `/work/career/experience/`   |
| Volunteering | `content/career/volunteering/` | `/work/career/volunteering/` |
| Education    | `content/career/education/`    | `/work/career/education/`    |
| Skills       | `content/career/skills.md`     | `/work/career/skills/`       |

The four sections and their labels are declared in `vocabulary/career-sections`
at the repository root, `word=Label` per line in canonical order — the same file
the tab bar and the routes read, and where a section is added or renamed.

Nothing validates these files: a missing field renders as nothing. Build and
look at the page.

## Experience

```yaml
---
employer: <Employer>
location: <City, ST>
title: <Job Title>
start: <YYYY-MM>
end: <YYYY-MM | present>
---

- <What you did, one line per bullet.>
```

One file per role, never per employer: roles group by `employer` by identity,
so two stints there merge even with another role dated between them. The summary
line is `<title> - <employer>`.

## Volunteering

Same shape, with `organization` in place of `employer`; summarised as
`<title> - <organization>`.

## Education

```yaml
---
institution: <Institution>
location: <City, ST>
degree: <Degree>, <Field>
start: <YYYY-MM>
end: <YYYY-MM>
note: <GPA or honours, optional>
---
```

No body. Summarised as `<degree> - <institution>`.

## Skills

`content/career/skills.md` has no frontmatter: bullets of
`- **<Group>:** <skill>, <skill>, <skill>`. A comma inside parentheses belongs
to the skill, so `<skill> (<a>, <b>, <c>)` stays whole.

## Dates

`start` and `end` take `<YYYY>`, `<YYYY-MM>`, or `present`. A month prints as
its name, a range as `<Month YYYY> – <Month YYYY>`. Anything else prints as
written.

Entries order newest first by `start`.
