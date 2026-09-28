"use client";
import { useState } from "react";
import { getWorkspaceStorage } from "./workspace-client";

export function useWorkspaceStorage() {
  return useState(getWorkspaceStorage)[0];
}
