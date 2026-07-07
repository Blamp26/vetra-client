---
name: Vetra Desktop
description: Calm, Tauri-first desktop messenger for day-long communication.
colors:
  app-bg: "#f3f5f2"
  surface: "#fbfcfa"
  panel: "#e9ede7"
  panel-strong: "#dde3db"
  line: "#cfd6cd"
  ink: "#181d1a"
  muted-ink: "#5b655d"
  accent: "#2f6b5b"
  accent-strong: "#245447"
  accent-soft: "#dceae4"
  danger: "#a6463b"
  warning: "#9b6a14"
  success: "#2d6a4f"
  dark-bg: "#161b18"
  dark-surface: "#1e2521"
  dark-panel: "#252d28"
  dark-line: "#303a34"
  dark-ink: "#eef2ee"
  dark-muted-ink: "#aab4ad"
  dark-accent: "#7db19f"
typography:
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.02em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.45
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  sidebar-item-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  message-outgoing:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  message-incoming:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
---

# Design System: Vetra Desktop

## Overview

**Creative North Star: "The Quiet Operations Desk"**

Vetra should feel like a focused desktop communications tool: stable, legible, and ready to stay open all day. The visual system is restrained, slightly tactile, and deliberately practical. It borrows the familiarity of established messenger tooling without inheriting the loud gamer aesthetic or generic AI SaaS gradients that make trust feel borrowed.

The interface should read as one connected surface with clear lanes for navigation, conversation, and secondary controls. Density is welcome, but the rhythm must stay breathable through disciplined spacing, strong text contrast, and dependable component states.

Key characteristics:
- Calm shell, high-legibility conversation area, restrained accent usage
- Mild radius and tonal layering instead of sharp brutality or pill-heavy softness
- Desktop-first hierarchy with visible hover, focus, selected, loading, and error states
- Familiar interaction models for messaging, files, calls, and settings

## Colors

The palette is restrained and semantic-first: cool neutrals establish trust, while a muted green accent marks current action and selected state.

### Primary
- **Workbench Green** (`#2f6b5b`): Primary actions, active navigation, outgoing message emphasis, and focus-worthy status moments.
- **Deep Workbench Green** (`#245447`): Hover and pressed states where the primary accent needs more authority.

### Secondary
- **Soft Signal Wash** (`#dceae4`): Selected rows, subtle active backgrounds, and low-stakes emphasis blocks.

### Neutral
- **Desk Background** (`#f3f5f2`): App-level backdrop.
- **Paper Surface** (`#fbfcfa`): Main panes, forms, popovers, and modal surfaces.
- **Panel Tint** (`#e9ede7`): Sidebar, titlebar, inactive message surfaces, and sectional grouping.
- **Divider Line** (`#cfd6cd`): Hairline borders and structural separators.
- **Primary Ink** (`#181d1a`): Core text.
- **Muted Ink** (`#5b655d`): Metadata, timestamps, helper text.

### Named Rules
**The Accent Has A Job Rule.** Accent color is for primary action, current selection, and state cues only. If a surface can be neutral, keep it neutral.

## Typography

**Display Font:** Inter, ui-sans-serif, system-ui, sans-serif  
**Body Font:** Inter, ui-sans-serif, system-ui, sans-serif  
**Label/Mono Font:** ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace

**Character:** Compact, contemporary, and desktop-native. Typography should do most of the hierarchy work through a tight product scale instead of decorative faces.

### Hierarchy
- **Title** (600, `1.125rem`, 1.3): Chat headers, section titles, major settings headings.
- **Body** (400, `0.9375rem`, 1.5): Message text, form content, primary app copy.
- **Secondary** (400, `0.875rem`, 1.45): Sidebar previews, supportive descriptions, dense UI copy.
- **Label** (600, `0.75rem`, 1.3): Input labels, metadata group labels, button support text.
- **Mono** (500, `0.8125rem`, 1.45): Technical strings, codes, or message content that benefits from tabular rhythm.

### Named Rules
**The No Mystery Hierarchy Rule.** Adjacent text roles must differ by more than one cue: size plus weight, or size plus color, never a barely-there 1px jump.

## Elevation

Depth is conveyed primarily through tonal layering and crisp borders. Most panes stay flat at rest. Menus, modals, context surfaces, and active call overlays may use a short, tight shadow to separate from busy message content, but shadows should remain structural rather than atmospheric.

### Shadow Vocabulary
- **Overlay Lift** (`box-shadow: 0 10px 30px rgba(18, 24, 20, 0.12)`): Menus, modals, and floating call surfaces.
- **Focus Lift** (`box-shadow: 0 0 0 1px rgba(47, 107, 91, 0.18)`): Focused controls or selected surfaces that need emphasis without heavy glow.

### Named Rules
**The Flat By Default Rule.** If a surface does not move, float, or ask for attention, it should earn separation through tone and border before shadow.

## Components

### Buttons
- **Shape:** Mild radius (`12px`) with compact desktop padding.
- **Primary:** Workbench Green fill with light text; used sparingly for the highest-value action in a region.
- **Secondary/Ghost:** Neutral surfaces with clear border and hover tint; preferred for routine messenger controls.
- **Hover / Focus:** Slight tone shift plus visible ring, never motion-heavy flourish.

### Cards / Containers
- **Corner Style:** `12px` for panels and forms, `16px` for message bubbles and richer media containers.
- **Background:** Tonal layers from Desk Background to Paper Surface to Panel Tint.
- **Border:** Hairline neutral borders instead of side stripes or nested-card stacks.
- **Internal Padding:** Mostly `12px`, `16px`, and `24px`.

### Inputs / Fields
- **Style:** Filled neutral surface with clear border and strong text contrast.
- **Focus:** Accent ring or accent-border response that remains visible in both themes.
- **Error / Disabled:** Dedicated semantic tone shifts, never opacity alone.

### Navigation
- **Sidebar:** Continuous vertical lane with selected-row tint, compact metadata, and strong unread affordances.
- **Titlebar / Toolbar:** Tauri-native restraint; controls stay minimal and aligned to the shell vocabulary.
- **Context menus:** Compact, bordered, and positioned away from message text whenever possible.

### Message Surfaces
- **Incoming:** Panel Tint background with dark ink, generous but not oversized radius.
- **Outgoing:** Workbench Green background with light text and clean metadata contrast.
- **Attachments:** Structured preview rows using tonal grouping and explicit actions.

## Do's and Don'ts

### Do:
- **Do** keep the shell calm and let message content carry the screen.
- **Do** use the accent for primary action, active selection, and key state feedback.
- **Do** keep desktop density intentional with 8/12/16/24/32px spacing steps.
- **Do** preserve clear hover, focus, active, disabled, loading, and error states across all controls.
- **Do** favor full-border emphasis, tinted surfaces, and structure over decorative containers.

### Don't:
- **Don't** introduce purple or blue gradients, neon accents, or glassmorphism.
- **Don't** build nested card stacks or gray-on-gray low-contrast surfaces.
- **Don't** use oversized rounded icon tiles or over-round core containers.
- **Don't** let menus, popovers, or call overlays cover the message text users are acting on.
- **Don't** add decorative flair that breaks the familiar messenger workflow.
