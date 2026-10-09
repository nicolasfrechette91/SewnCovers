import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";

import NotFound from "../app/not-found";
import {
  loadUploadAvailability,
  resetUploadAvailability,
} from "../services/upload-availability";

afterEach(() => {
  cleanup();
  resetUploadAvailability();
});

test("the 404 page explains itself and links home and to the configurator", () => {
  render(<NotFound />);

  assert.equal(document.querySelectorAll("h1").length, 1);
  assert.ok(
    screen.getByRole("heading", { level: 1, name: "This page doesn't exist." }),
  );
  assert.ok(screen.getByText("The link may be mistyped or out of date."));
  // next/link adds the base path and trailing slash in the export build.
  assert.ok(
    screen
      .getByRole("link", { name: "Design a cover" })
      .getAttribute("href")
      ?.startsWith("/configure"),
  );
  assert.equal(
    screen
      .getByRole("link", { name: "Go to the home page" })
      .getAttribute("href"),
    "/",
  );
});

test("upload availability is asked once per tab and a failure is retried later", async () => {
  let calls = 0;
  const enabledClient = {
    async getUploadAvailability() {
      calls += 1;
      return { enabled: false };
    },
  };

  assert.equal(await loadUploadAvailability(enabledClient), false);
  assert.equal(await loadUploadAvailability(enabledClient), false);
  assert.equal(calls, 1);

  resetUploadAvailability();
  const failingClient = {
    async getUploadAvailability(): Promise<{ enabled: boolean }> {
      calls += 1;
      throw new Error("offline");
    },
  };
  // Unknown, not "disabled": the configurator shows nothing upload-related.
  assert.equal(await loadUploadAvailability(failingClient), null);
  assert.equal(await loadUploadAvailability(enabledClient), false);
  assert.equal(calls, 3);
});
