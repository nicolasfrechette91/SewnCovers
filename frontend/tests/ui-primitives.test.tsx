import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";

import {
  Badge,
  Checkbox,
  Field,
  SectionHeader,
  Select,
  SpecList,
  Surface,
  surfaceClasses,
  Textarea,
  TextInput,
} from "../components/ui";

afterEach(() => {
  cleanup();
});

// Field ---------------------------------------------------------------------

test("Field names the control and wires help and error into aria-describedby", () => {
  render(
    <Field
      error="Enter a valid email."
      help="We never share it."
      id="email"
      label="Email"
    >
      {(control) => <TextInput {...control} />}
    </Field>,
  );

  const input = screen.getByLabelText("Email");
  assert.equal(input.id, "email");
  assert.equal(
    input.getAttribute("aria-describedby"),
    "email-help email-error",
  );
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.equal(
    document.getElementById("email-help")?.textContent,
    "We never share it.",
  );
  assert.equal(
    document.getElementById("email-error")?.textContent,
    "Enter a valid email.",
  );
  assert.equal(
    document.getElementById("email-error")?.hasAttribute("role"),
    false,
  );
});

test("Field without help or error leaves the control undescribed and valid", () => {
  render(<Field label="Name">{(control) => <TextInput {...control} />}</Field>);

  const input = screen.getByLabelText("Name");
  assert.equal(input.hasAttribute("aria-describedby"), false);
  assert.equal(input.hasAttribute("aria-invalid"), false);
  // The id is generated, and the label points at it.
  assert.ok(input.id.length > 0);
  assert.equal(
    document.querySelector(`label[for="${input.id}"]`)?.textContent,
    "Name",
  );
});

test("Field appends extra described-by ids after its own", () => {
  render(
    <>
      <p id="result-count">6 of 15 patterns</p>
      <Field
        describedBy="result-count"
        help="Try a colour."
        id="search"
        label="Search"
      >
        {(control) => <TextInput {...control} type="search" />}
      </Field>
    </>,
  );

  assert.equal(
    screen.getByLabelText("Search").getAttribute("aria-describedby"),
    "search-help result-count",
  );
});

test("Field can announce its error and hide its label without losing the name", () => {
  render(
    <Field
      error="Enter a name."
      errorRole="alert"
      hideLabel
      id="rename"
      label="New project name"
    >
      {(control) => <TextInput {...control} />}
    </Field>,
  );

  const input = screen.getByLabelText("New project name");
  assert.equal(input.id, "rename");
  assert.match(
    document.querySelector('label[for="rename"]')?.className ?? "",
    /\bsr-only\b/,
  );
  assert.equal(screen.getByRole("alert").textContent, "Enter a name.");
});

// Controls -------------------------------------------------------------------

test("TextInput, Select and Textarea share one frame and forward refs", () => {
  const inputRef = createRef<HTMLInputElement>();
  render(
    <>
      <TextInput aria-label="Text" ref={inputRef} className="font-mono" />
      <Select aria-label="Choice">
        <option>One</option>
      </Select>
      <Textarea aria-label="Notes" />
    </>,
  );

  const text = screen.getByLabelText("Text");
  assert.equal(inputRef.current, text);
  for (const control of [
    text,
    screen.getByLabelText("Choice"),
    screen.getByLabelText("Notes"),
  ]) {
    assert.match(control.className, /\bmin-h-12\b/);
    assert.match(control.className, /\bpx-control-x\b/);
  }
  assert.match(text.className, /\bfont-mono\b/);
  assert.equal(screen.getByLabelText("Choice").tagName, "SELECT");
  assert.equal(screen.getByLabelText("Notes").tagName, "TEXTAREA");
});

test("narrow controls keep the frame at 6rem instead of full width", () => {
  render(
    <>
      <TextInput aria-label="Quantity" type="number" width="narrow" />
      <Select aria-label="Choice" width="narrow">
        <option>One</option>
      </Select>
      <Textarea aria-label="Notes" width="narrow" />
      <TextInput aria-label="Default" />
    </>,
  );

  const tokens = (element: HTMLElement) => element.className.split(" ");
  for (const name of ["Quantity", "Choice", "Notes"]) {
    const control = tokens(screen.getByLabelText(name));
    assert.ok(control.includes("w-24"), name + " is 6rem wide");
    assert.equal(
      control.includes("w-full"),
      false,
      name + " is not full width",
    );
    // The frame is otherwise the same, so the 48px minimum still holds.
    assert.ok(control.includes("min-h-12"), name + " keeps min-h-12");
  }
  const normal = tokens(screen.getByLabelText("Default"));
  assert.ok(normal.includes("w-full"));
  assert.equal(normal.includes("w-24"), false);
  // width is a size keyword here, never the HTML width attribute.
  assert.equal(screen.getByLabelText("Quantity").hasAttribute("width"), false);
});

test("only text inputs and textareas take the read-only look, never selects", () => {
  // Browsers match :read-only on <select>, so a select carrying these classes
  // would be filled like a locked field.
  render(
    <>
      <TextInput aria-label="Text" />
      <Textarea aria-label="Notes" />
      <Select aria-label="Choice">
        <option>One</option>
      </Select>
      <Select aria-label="Narrow choice" width="narrow">
        <option>One</option>
      </Select>
    </>,
  );

  const readOnlyTokens = (name: string) =>
    screen
      .getByLabelText(name)
      .className.split(" ")
      .filter((token) => token.startsWith("read-only:"));
  assert.ok(readOnlyTokens("Text").includes("read-only:bg-surface-subtle"));
  assert.ok(readOnlyTokens("Notes").includes("read-only:bg-surface-subtle"));
  assert.deepEqual(readOnlyTokens("Choice"), []);
  assert.deepEqual(readOnlyTokens("Narrow choice"), []);
});

// Surface -------------------------------------------------------------------

const tokens = (element: Element) => element.className.split(" ");

test("Surface defaults are the panel recipe and keep the caller's classes", () => {
  render(
    <Surface as="section" aria-label="Panel" className="scroll-mt-layout">
      Body
    </Surface>,
  );

  const panel = screen.getByRole("region", { name: "Panel" });
  assert.equal(panel.tagName, "SECTION");
  for (const token of [
    "min-w-0",
    "rounded-panel",
    "border",
    "border-border",
    "bg-surface",
    "p-card",
    "shadow-hairline",
    "scroll-mt-layout",
  ]) {
    assert.ok(tokens(panel).includes(token), "has " + token);
  }
});

test("Surface takes a tight padding and renders as a list item", () => {
  render(
    <ul>
      <Surface as="li" padding="tight" className="sm:p-4">
        Item
      </Surface>
    </ul>,
  );

  const item = screen.getByRole("listitem");
  assert.equal(item.tagName, "LI");
  assert.ok(tokens(item).includes("p-3"));
  assert.equal(tokens(item).includes("p-card"), false);
  // A responsive padding from the caller can sit beside the base padding.
  assert.ok(tokens(item).includes("sm:p-4"));
});

test("Surface tones, elevation and radius map to the design tokens", () => {
  render(
    <>
      <Surface
        data-testid="subtle"
        tone="subtle"
        radius="card"
        elevation="flat"
        padding="compact"
      />
      <Surface data-testid="page" tone="page" elevation="flat" padding="none" />
      <Surface data-testid="emphasis" tone="emphasis" elevation="card" />
      <Surface data-testid="danger" tone="danger" padding="tight" />
    </>,
  );

  const subtle = tokens(screen.getByTestId("subtle"));
  for (const token of [
    "bg-surface-subtle",
    "rounded-card",
    "shadow-none",
    "p-4",
  ]) {
    assert.ok(subtle.includes(token), "subtle has " + token);
  }
  const page = tokens(screen.getByTestId("page"));
  assert.ok(page.includes("bg-page"));
  assert.equal(
    page.some((token) => token.startsWith("p-")),
    false,
  );
  const emphasis = tokens(screen.getByTestId("emphasis"));
  assert.ok(
    emphasis.includes("border-brand") && emphasis.includes("shadow-card"),
  );
  assert.ok(
    tokens(screen.getByTestId("danger")).includes("border-error-border"),
  );
});

test("surfaceClasses puts the same recipe on elements Surface does not render", () => {
  render(
    <fieldset className={surfaceClasses({ className: "fieldset-panel" })}>
      <legend>Group</legend>
    </fieldset>,
  );

  const group = screen.getByRole("group", { name: "Group" });
  for (const token of [
    "fieldset-panel",
    "min-w-0",
    "rounded-panel",
    "p-card",
    "shadow-hairline",
  ]) {
    assert.ok(tokens(group).includes(token), "has " + token);
  }
});

// SectionHeader --------------------------------------------------------------

test("SectionHeader renders the level, size, eyebrow and id on the heading", () => {
  render(
    <SectionHeader
      eyebrow="Your account"
      level={3}
      size="card"
      title="Version history"
      titleId="history-heading"
    />,
  );

  const heading = screen.getByRole("heading", {
    level: 3,
    name: "Version history",
  });
  assert.equal(heading.id, "history-heading");
  const classes = tokens(heading);
  assert.ok(
    classes.includes("text-card-title") && classes.includes("font-display"),
  );
  // The eyebrow sits above the heading and the heading leaves room for it.
  assert.ok(classes.includes("mt-3"));
  assert.equal(screen.getByText("Your account").tagName, "P");
});

test("SectionHeader subhead is the quiet sans heading", () => {
  render(
    <SectionHeader
      level={3}
      size="subhead"
      title="Checklist"
      className="mt-component"
    />,
  );

  const heading = screen.getByRole("heading", { level: 3, name: "Checklist" });
  const classes = tokens(heading);
  assert.ok(
    classes.includes("text-subhead") && classes.includes("font-control"),
  );
  assert.equal(classes.includes("font-display"), false);
  // className lands on the wrapper, so margins sit outside the heading.
  assert.ok(
    tokens(heading.parentElement?.parentElement as Element).includes(
      "mt-component",
    ),
  );
});

test("SectionHeader passes a ref and tabIndex to the heading for focus targets", () => {
  const ref = createRef<HTMLHeadingElement>();
  render(<SectionHeader title="Sign in" titleProps={{ ref, tabIndex: -1 }} />);

  const heading = screen.getByRole("heading", { name: "Sign in" });
  assert.equal(ref.current, heading);
  assert.equal(heading.getAttribute("tabindex"), "-1");
});

// SpecList --------------------------------------------------------------------

const specItems = [
  { label: "Payment", value: "Paid" },
  {
    label: "Final total",
    value: "$131.65 CAD",
    valueClassName: "text-card-title text-brand",
  },
];

test("SpecList pairs mono labels with values and takes a column preset", () => {
  const { container } = render(<SpecList columns={4} items={specItems} />);

  const list = container.querySelector("dl") as Element;
  for (const token of ["grid", "sm:grid-cols-2", "lg:grid-cols-4"]) {
    assert.ok(tokens(list).includes(token), "has " + token);
  }
  const labels = [...container.querySelectorAll("dt")];
  assert.deepEqual(
    labels.map((label) => label.textContent),
    ["Payment", "Final total"],
  );
  assert.ok(
    tokens(labels[0]).includes("font-mono") &&
      tokens(labels[0]).includes("uppercase"),
  );
});

test("SpecList valueClassName replaces the default value text, other items keep it", () => {
  const { container } = render(<SpecList items={specItems} />);

  const [plain, total] = [...container.querySelectorAll("dd")];
  assert.ok(
    tokens(plain).includes("text-body") &&
      tokens(plain).includes("text-text-primary"),
  );
  assert.ok(
    tokens(total).includes("text-brand") &&
      tokens(total).includes("text-card-title"),
  );
  assert.equal(tokens(total).includes("text-text-primary"), false);
  // The spacing under the label is the list's, not the item's.
  assert.ok(tokens(total).includes("mt-1"));
});

test("SpecList can be framed and follow its container's width", () => {
  const { container } = render(
    <SpecList columns="container" framed items={specItems} />,
  );

  const list = tokens(container.querySelector("dl") as Element);
  for (const token of [
    "border-y",
    "border-dashed",
    "py-4",
    "grid-cols-2",
    "@xl:grid-cols-3",
  ]) {
    assert.ok(list.includes(token), "has " + token);
  }
  assert.equal(list.includes("sm:grid-cols-2"), false);
});

test("SpecList columns={1} stays a single column", () => {
  const { container } = render(<SpecList columns={1} items={specItems} />);

  const list = tokens(container.querySelector("dl") as Element);
  assert.equal(
    list.some((token) => token.includes("grid-cols")),
    false,
  );
});

// Badge ------------------------------------------------------------------------

test("Badge is a small non-interactive status tag", () => {
  render(<Badge>Paid</Badge>);

  const badge = screen.getByText("Paid");
  assert.equal(badge.tagName, "SPAN");
  for (const token of [
    "font-mono",
    "uppercase",
    "rounded-control-small",
    "border",
  ]) {
    assert.ok(tokens(badge).includes(token), "has " + token);
  }
});

// Checkbox -------------------------------------------------------------------

test("Checkbox is named by its wrapping label, which is a 44px target", () => {
  const ref = createRef<HTMLInputElement>();
  render(
    <Checkbox
      id="terms"
      label="I acknowledge the terms."
      name="acceptedTerms"
      ref={ref}
      required
    />,
  );

  const box = screen.getByRole("checkbox", {
    name: "I acknowledge the terms.",
  });
  assert.equal(ref.current, box);
  assert.equal(box.id, "terms");
  assert.equal(box.getAttribute("name"), "acceptedTerms");
  assert.equal((box as HTMLInputElement).required, true);
  // The label contains the box, so clicking the text toggles it, and it is
  // the element the responsive spec measures against the 44px target size.
  const label = box.closest("label");
  assert.ok(label);
  assert.match(label.className, /\bmin-h-11\b/);
  assert.equal(box.hasAttribute("aria-describedby"), false);
  assert.equal(box.hasAttribute("aria-invalid"), false);
});

test("Checkbox wires its error and help, keeping a caller's aria-describedby", () => {
  render(
    <Checkbox
      aria-describedby="outside-note"
      error="Acknowledge the terms to continue."
      help="Version 1."
      id="register-terms"
      label="I acknowledge the terms."
    />,
  );

  const box = screen.getByRole("checkbox");
  assert.equal(
    box.getAttribute("aria-describedby"),
    "outside-note register-terms-help register-terms-error",
  );
  assert.equal(box.getAttribute("aria-invalid"), "true");
  assert.equal(
    document.getElementById("register-terms-error")?.textContent,
    "Acknowledge the terms to continue.",
  );
  // The messages sit outside the label, so they are not part of the name.
  assert.equal(
    screen.getByRole("checkbox", { name: "I acknowledge the terms." }),
    box,
  );
});

test("Checkbox generates an id when none is given", () => {
  render(<Checkbox label="Remember me" />);
  const box = screen.getByRole("checkbox", { name: "Remember me" });
  assert.ok(box.id.length > 0);
});
