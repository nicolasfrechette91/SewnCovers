import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";

import { Checkbox, Field, Select, Textarea, TextInput } from "../components/ui";

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
