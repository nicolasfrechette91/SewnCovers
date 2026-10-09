import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { auditDocument } from "../e2e/support/document-audit";

// The audit that the end-to-end specs run on every route and stage is only
// worth trusting if it fails on bad markup. These cases feed it both.

afterEach(() => {
  document.body.innerHTML = "";
});

function audit(html: string) {
  document.body.innerHTML = html;
  return auditDocument();
}

function rules(html: string) {
  return audit(html).map(({ rule }) => rule);
}

test("accepts one h1 with headings that step down one level at a time", () => {
  assert.deepEqual(
    audit(`
      <h1>Page</h1>
      <h2>Section</h2><h3>Card</h3><h3>Another card</h3>
      <h2>Next section</h2>
    `),
    [],
  );
});

test("rejects a page without exactly one h1", () => {
  assert.deepEqual(rules("<h2>Only a section</h2>"), [
    "heading-outline",
    "heading-outline",
  ]);
  assert.match(audit("<p>No headings at all</p>")[0].detail, /found 0/);
  assert.match(audit("<h1>One</h1><h1>Two</h1>")[0].detail, /found 2/);
});

test("rejects skipped heading levels, including a first heading below h1", () => {
  const skipped = audit("<h1>Page</h1><h3>Skipped</h3>");
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].detail, /h1 is followed by h3/);

  assert.match(
    audit("<h2>Starts low</h2><h1>Page</h1>")[0].detail,
    /starts at h2/,
  );
  // Going back up and then down again is fine; only a jump down is a skip.
  assert.deepEqual(
    audit("<h1>A</h1><h2>B</h2><h3>C</h3><h2>D</h2><h3>E</h3>"),
    [],
  );
  // role="heading" counts, with its aria-level.
  assert.match(
    audit('<h1>A</h1><div role="heading" aria-level="4">Deep</div>')[0].detail,
    /h1 is followed by h4/,
  );
});

test("ignores headings that are hidden", () => {
  assert.deepEqual(
    audit(`
      <h1>Page</h1>
      <h4 hidden>Not shown</h4>
      <div aria-hidden="true"><h5>Decorative</h5></div>
    `),
    [],
  );
});

test("rejects empty headings and data values used as headings", () => {
  assert.deepEqual(rules("<h1>Page</h1><h2>  </h2>"), ["empty-heading"]);
  for (const value of [
    "$104.50 CAD",
    "Estimated subtotal: $104.50",
    "person@example.com",
    "SC-DEMO-ORDER0001",
  ]) {
    assert.deepEqual(
      rules(`<h1>Page</h1><h2>${value}</h2>`),
      ["data-heading"],
      value,
    );
  }
  // Words that merely sit near money are fine.
  assert.deepEqual(
    rules("<h1>Pricing and quotes</h1><h2>How demonstration prices work</h2>"),
    [],
  );
});

test("requires navigation landmarks to contain links and, when several, names", () => {
  assert.deepEqual(
    audit('<h1>Page</h1><nav aria-label="Primary"><a href="/a">A</a></nav>'),
    [],
  );
  // The old stage-actions markup: a navigation landmark around two buttons.
  const buttonsOnly = audit(
    '<h1>Page</h1><nav aria-label="Stage actions"><button>Back</button><button>Continue</button></nav>',
  );
  assert.deepEqual(
    buttonsOnly.map(({ rule }) => rule),
    ["landmark"],
  );
  assert.match(buttonsOnly[0].detail, /contains no links/);

  assert.match(
    audit(
      '<h1>P</h1><nav aria-label="A"><a href="/">x</a></nav><nav><a href="/">y</a></nav>',
    )[0].detail,
    /has no name/,
  );
  assert.match(
    audit(
      '<h1>P</h1><nav aria-label="A"><a href="/">x</a></nav><nav aria-label="a"><a href="/">y</a></nav>',
    )[0].detail,
    /share the name/,
  );
  // A labelled group is not a landmark, so buttons are welcome in one.
  assert.deepEqual(
    audit(
      '<h1>P</h1><div role="group" aria-label="Stage actions"><button>Back</button></div>',
    ),
    [],
  );
});

test("requires an aria-label to start with the visible label", () => {
  // The old summary buttons: the visible text and the name disagreed.
  const mismatched = audit(
    '<h1>P</h1><button aria-label="Print configuration summary">Print summary</button>',
  );
  assert.deepEqual(
    mismatched.map(({ rule }) => rule),
    ["label-in-name"],
  );
  assert.match(
    mismatched[0].detail,
    /"print configuration summary".*"print summary"/,
  );

  assert.deepEqual(
    audit(
      '<h1>P</h1><button aria-label="Print summary, opens the print dialog">Print summary</button>',
    ),
    [],
  );
  assert.deepEqual(
    audit(
      '<h1>P</h1><a href="/" aria-label="SewnCovers home"><span>SewnCovers</span></a>',
    ),
    [],
  );
  // The comparison ignores case and spacing, as a screen reader does.
  assert.deepEqual(
    audit(
      '<h1>P</h1><button aria-label="Shape complete, stage 1 of 6"><span>Shape</span> <span>Complete</span></button>',
    ),
    [],
  );
  // Text a sighted person cannot see does not count as the label.
  assert.deepEqual(
    audit(
      '<h1>P</h1><button aria-label="Close dialog"><span aria-hidden="true">×</span></button>',
    ),
    [],
  );
  // A control without an aria-label is named by its content: nothing to check.
  assert.deepEqual(audit("<h1>P</h1><button>Print summary</button>"), []);
});

test("rejects names on generic elements", () => {
  const named = audit('<h1>P</h1><div aria-label="Repeating preview"></div>');
  assert.deepEqual(
    named.map(({ rule }) => rule),
    ["generic-name"],
  );
  assert.deepEqual(
    rules('<h1>P</h1><span aria-labelledby="x"></span><p id="x">y</p>'),
    ["generic-name"],
  );

  assert.deepEqual(
    audit('<h1>P</h1><div role="img" aria-label="Repeating preview"></div>'),
    [],
  );
  assert.deepEqual(
    audit('<h1>P</h1><section aria-label="Notes"></section>'),
    [],
  );
  assert.deepEqual(
    audit('<h1>P</h1><ul aria-label="Primary destinations"><li>A</li></ul>'),
    [],
  );
});
