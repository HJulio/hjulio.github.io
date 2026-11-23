---
title: "tmux-starbase: one Mac, ten coding agents, any terminal"
description: "I moved my whole terminal workflow into tmux so that my always-on Mac looks the same from the desk, the laptop and the tablet: workspaces, a session tree, a file tree, a key menu and a bar that tells me which agent is waiting. What I built, why, and the bugs that only showed up once I used it."
date: "Nov 23 2026"
image: "/static/tmux-starbase/hero.png"
---

I have a Mac mini that never sleeps. On a normal day it runs around ten coding agents, split over four or five projects, and I am not always sitting in front of it. Sometimes I am on the laptop, sometimes on another network, sometimes I just want to check from the sofa whether anything is waiting for me.

I tried what was around first.

[cmux](https://github.com/manaflow-ai/cmux) was the one I liked most: workspaces in a sidebar, a file tree, a browser pane, and a CLI that the agent itself can drive. On the mini it is lovely. From the laptop it fell apart, and for a structural reason: the panels belong to the app, not to the session. Over SSH I either lost them, or I ended up running its remote mode on top of tmux, two multiplexers stacked, and attaching was hit or miss. I tried sharing the same sessions on both machines and gave up.

I also got into the beta of Rex, the multiplexer that [Superlogical](https://www.superlogical.com) is building, with the creator of Ghostty on the team. Ghostty is the terminal I use every day, so I wanted it to be the answer. In my time with it I hit the same wall: plenty of useful things for agents while I sat at the machine, and once I came in from another one I lost them. It is a beta, and that may well change.

So I flipped it around. Everything lives in tmux on the mini, and the terminal is only a window onto it. I packaged the result as **[tmux-starbase](https://github.com/HJulio/tmux-starbase)**.

![The main view: session tree on the left, an agent at work in the middle, file tree on the right](/static/tmux-starbase/hero.png)

## The idea

Three decisions carry the whole thing.

**The UI is made of tmux panes.** The session tree is a pane. The file tree is a pane. The tab bar is the tmux status line. Since none of it is drawn by the terminal app, it is identical in Ghostty on the mini, in Ghostty on the laptop over SSH, and in an SSH client on a tablet.

**The state lives on one machine.** Closing the laptop or losing the connection does nothing to the agents. I reconnect and I am where I left off, same tab, same scrollback.

**The bar tells me who needs me.** With ten agents the real question is never "what is running" but "which one is blocked on me". A tab turns red when its agent finishes or asks for permission. A counter adds those up across all workspaces, because the tab bar only shows the workspace I am in. One key jumps to the next one waiting.

![A short tour: switching tabs, the menu, finding a tab, jumping to the agent that is waiting](/static/tmux-starbase/demo.gif)

## What is in it

- **Workspaces and tabs.** A tmux session per workspace, a window per tab, a color per workspace.
- **A menu instead of a prefix.** I never remember tmux keys. `Ctrl-b` opens a menu with every action and its key next to it. The keys are tmux's own, so after a week you stop reading the menu, and if you already know tmux nothing changes.
- **Two trees.** Sessions on the left with a badge on each agent (running, waiting, done). Files on the right, following the directory of the pane. Picking a file opens it in a small editor above.
- **Surviving a reboot.** The layout is saved every five minutes. When tmux starts empty it is rebuilt, and each tab that held an agent gets its `claude --resume <id>` typed and waiting for Enter. Nothing is started for you, which matters when the same conversation might be open somewhere else.
- **The remote side.** A client command that leaves the terminal clean when a link drops, SSH settings that reuse one authenticated connection, and a `preview` command to look at an HTML file from the mini on the laptop through a tunnel.
- **A bar with opinions.** CPU, temperature, memory, running containers, the tailnet the machine is on, where this terminal connects from. On a narrow terminal the date, clock and stats fold down to their colored arrows.

![Ctrl-b opens a menu with every action](/static/tmux-starbase/menu.png)

It stands on four plugins I did not write: [tmux-pane-tree](https://github.com/sandudorogan/tmux-pane-tree) for the session tree, [treemux](https://github.com/kiyoon/treemux) for the file tree, and [tmux-resurrect](https://github.com/tmux-plugins/tmux-resurrect) with [tmux-continuum](https://github.com/tmux-plugins/tmux-continuum) for the snapshots. They are cloned at pinned commits, with no plugin manager, so an update never happens behind my back.

## How it was built

In one long day, pairing with Claude Code, with one rule that paid for itself many times: **never test on the real tmux server.** That server holds the agents. Every change went first to a throwaway server on its own socket, driven by a scripted client in a pseudo-terminal that pressed keys, clicked on the bar and read the screen back. Only then was it loaded on the real one.

That scripted client is also how the screenshots were made. It records what tmux draws, and the recording is rendered to an image. No window was photographed, which is why nothing of my real machine is in them.

## The bugs that using it found

The first version worked in every test and was annoying within the hour. The interesting problems only appeared in use.

- **A one-second redraw on every tab switch.** The tree plugin adds itself to a tab the first time you enter it. That narrows the working pane, and the agent redraws its entire conversation. The fix is to open the tree in every tab at once.
- **A marker that stopped following me.** Clicking a row in the tree leaves the focus on the tree, and a focused tree shows its own cursor instead of where you are. After a few clicks the marker pointed at a tab I had left long ago. Now the focus goes back to the working pane on arrival, which also means I can type straight away.
- **A tree squeezed to one column.** tmux scales every pane when the terminal changes size. Going from the big screen to the laptop left a 28-column tree with a single column. A hook now puts the side panels back to their width.
- **A file tree that would not open on the right.** That one was a quoting bug in the plugin itself. I sent the fix upstream and [it was merged](https://github.com/kiyoon/treemux/pull/21) the same day. A second pull request, turning my cosmetic patch to the session tree into options, [is open](https://github.com/sandudorogan/tmux-pane-tree/pull/18).

None of these would have come out of a checklist. They came out of clicking around for an afternoon and writing down what felt wrong.

## Limits

It is my daily setup, shared as is, and it has been tested on exactly one kind of machine: macOS on Apple Silicon. Linux should be a matter of swapping a handful of system commands, and the repo has [the list](https://github.com/HJulio/tmux-starbase/blob/main/docs/linux.md), but I have not done it. The attention notifications and the conversation ids are wired for Claude Code only. Restoring after a reboot has been exercised by killing and restarting tmux, not yet by an actual power cut.

## Try it

```bash
git clone https://github.com/HJulio/tmux-starbase ~/.tmux-starbase
~/.tmux-starbase/install.sh
starbase
```

It adds one line to your `~/.tmux.conf` and keeps its own files in its own folder; `uninstall.sh` takes it out again. Source, documentation and the rest of the screenshots are on [GitHub](https://github.com/HJulio/tmux-starbase).
