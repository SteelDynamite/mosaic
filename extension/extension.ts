/* extension.ts
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Meta from 'gi://Meta';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as windowing from './windowing.js';
import * as tiling from './tiling.js';
import * as drawing from './drawing.js';
import * as reordering from './reordering.js';

interface MaximizedWindowInfo {
    workspace: number;
    monitor: number;
}

let wm_eventids: number[] = [];
let display_eventids: number[] = [];
let workspace_man_eventids: number[] = [];
let maximized_windows: { [key: number]: MaximizedWindowInfo | false } = {};

let workspace_manager = global.workspace_manager;

function tile_window_workspace(meta_window: Meta.Window | null): void {
    if(!meta_window) return;
    let workspace = meta_window.get_workspace();
    if(!workspace) return;
    tiling.tile_workspace_windows(workspace, 
                                  meta_window, 
                                  null, 
                                  false);
}

let size_changed = false;
let event_timeout: number | undefined;
let expanded_window_timeout: number | undefined;
let tile_timeout: number | undefined;

export default class MosaicExtension extends Extension {
    constructor(metadata?: any) {
        super(metadata);
    }

    tile_all_workspaces(): void {
        let n_workspaces = workspace_manager.get_n_workspaces();
        for(let i = 0; i < n_workspaces; i++) {
            let workspace = workspace_manager.get_workspace_by_index(i);
            // Recurse all monitors
            let n_monitors = global.display.get_n_monitors();
            for(let j = 0; j < n_monitors; j++) {
                if (workspace) {
                    tiling.tile_workspace_windows(workspace, null, j, true);
                }
            }
        }
    }

    window_created_handler(_: any, window: Meta.Window): void {
        let timeout: any = setInterval(() => {
            let workspace = window.get_workspace();
            let monitor = window.get_monitor();
            // Ensure window is valid before performing any actions
            if( monitor !== null &&
                window.wm_class !== null &&
                window.get_compositor_private() &&
                workspace.list_windows().length !== 0 &&
                !window.is_hidden())
            {
                clearTimeout(timeout);
                if(windowing.is_related(window)) {
                    if((window.maximized_horizontally &&
                        window.maximized_vertically &&
                        windowing.get_monitor_workspace_windows(workspace, monitor).length > 1) ||
                        !tiling.window_fits(window, workspace, monitor))
                        windowing.move_oversized_window(window);
                    else
                        tiling.tile_workspace_windows(workspace, window, monitor, false);
                }
            }
        }, 10);
    }

    destroyed_handler(_: any, win: any): void {
        let window = win.meta_window;
        let monitor = window.get_monitor();
        if(monitor === global.display.get_primary_monitor()) {
            tiling.tile_workspace_windows(windowing.get_workspace(), 
                global.display.get_focus_window(),
                null,
                true);

            if (window.maximized_horizontally && window.maximized_vertically){
                let workspace = window.get_workspace();
                windowing.renavigate(workspace, windowing.get_monitor_workspace_windows(workspace, monitor).length === 0);   
            }
        }
    }
    
    switch_workspace_handler(_: any, win: any): void {
        tile_window_workspace(win.meta_window); // Tile when switching to a workspace. Helps to create a more cohesive experience.
    }

    size_change_handler(_: any, win: Meta.WindowActor, mode: Meta.SizeChange): void {
        let window = win.meta_window;
        if(windowing.is_related(window)) {
            let id = window.get_id();
            let workspace = window.get_workspace();
            let monitor = window.get_monitor();

            if(mode === Meta.SizeChange.FULLSCREEN || mode === Meta.SizeChange.MAXIMIZE) { // If the window was maximized
                if(window.maximized_horizontally && window.maximized_vertically && windowing.get_monitor_workspace_windows(workspace, monitor).length > 1) {
                    // If maximized (and not alone), move to new workspace and activate it if it is on the active workspace
                    let new_workspace = windowing.move_oversized_window(window);
                    /* We mark the window as activated by using its id to index an array
                        We put the value as the active workspace index so that if the workspace anatomy
                        of the current workspace changes, it does not move the maximized window to an unrelated
                        window.
                    */
                    if(new_workspace) {
                        maximized_windows[id] = {
                            workspace: new_workspace.index(),
                            monitor: monitor
                        }; // Mark window as maximized
                        tiling.tile_workspace_windows(workspace, null, monitor, false); // Sort the workspace where the window came from
                    }
                }
            } 
            else if(false && (mode === Meta.SizeChange.UNFULLSCREEN || mode === Meta.SizeChange.UNMAXIMIZE)) { // If the window was unmaximized
                if( (window.maximized_horizontally === false ||
                    window.maximized_vertically === false) && // If window is not maximized
                    maximized_windows[id] &&
                    windowing.get_monitor_workspace_windows(workspace, monitor).length === 1// If the workspace anatomy has not changed
                ) {
                    let maxInfo = maximized_windows[id] as MaximizedWindowInfo;
                    if( maxInfo.workspace === workspace.index() &&
                        maxInfo.monitor === monitor
                    ) {
                        maximized_windows[id] = false;
                        windowing.move_back_window(window); // Move the window back to its workspace
                        tile_window_workspace(window);
                    }
                }
            }
        }
    }

    size_changed_handler(_: any, win: Meta.WindowActor): void {
        let window = win.meta_window;
        if(!size_changed && windowing.is_related(window)) {
            // Live resizing
            size_changed = true;
            tiling.tile_workspace_windows(window.get_workspace(), window, null, true);
            size_changed = false;
        }
    }

    grab_op_begin_handler(_: any, window: Meta.Window, grabpo: number): void {
        if( windowing.is_related(window) &&
            (grabpo === Meta.GrabOp.MOVING || grabpo === Meta.GrabOp.KEYBOARD_MOVING) && // When a window has moved
            !(window.maximized_horizontally && window.maximized_vertically))
            reordering.start_drag(window);
        // tile_window_workspace(window);
    }

    grab_op_end_handler(_: any, window: Meta.Window, grabpo: number): void {
        if(windowing.is_related(window)) {
            reordering.stop_drag(window);
            if( (grabpo === Meta.GrabOp.MOVING || grabpo === Meta.GrabOp.KEYBOARD_MOVING) && // When a window has moved
                !(window.maximized_horizontally && window.maximized_vertically))
            {
                tiling.tile_workspace_windows(window.get_workspace(), window, null, false);
            }
            if(grabpo === Meta.GrabOp.RESIZING_SE) // When released from resizing
                tile_window_workspace(window);
        } else
            reordering.stop_drag(window, true);
    }

    workspace_created_handler(_: any, index: number): void {
        // tiling.append_workspace(index);
    }

    enable(): void {
        console.log("[MOSAIC]: Starting Mosaic layout manager.");
        
        wm_eventids.push(global.window_manager.connect('size-change', this.size_change_handler.bind(this)));
        wm_eventids.push(global.window_manager.connect('size-changed', this.size_changed_handler.bind(this)));
        display_eventids.push(global.display.connect('window-created', this.window_created_handler.bind(this)));
        wm_eventids.push(global.window_manager.connect('destroy', this.destroyed_handler.bind(this)));
        display_eventids.push(global.display.connect("grab-op-begin", this.grab_op_begin_handler.bind(this)));
        display_eventids.push(global.display.connect("grab-op-end", this.grab_op_end_handler.bind(this)));
        // workspace_man_eventids.push(global.workspace_manager.connect('workspace-added', this.workspace_created_handler.bind(this)));
        // wm_eventids.push(global.window_manager.connect('switch-workspace', this.switch_workspace_handler.bind(this)));

        // Sort all workspaces at startup
        setTimeout(this.tile_all_workspaces.bind(this), 300);
        tile_timeout = setInterval(this.tile_all_workspaces.bind(this), 60000 * 5) as any; // Tile all windows every 5 minutes (in case the machine/display goes to sleep)
    }

    disable(): void {
        console.log("[MOSAIC]: Disabling Mosaic layout manager.");
        // Disconnect all events
        if (tile_timeout) {
            clearInterval(tile_timeout as any);
            tile_timeout = undefined;
        }
        for(let eventid of wm_eventids)
            global.window_manager.disconnect(eventid);
        for(let eventid of display_eventids)
            global.display.disconnect(eventid);
        for(let eventid of workspace_man_eventids)
            global.workspace_manager.disconnect(eventid);
        drawing.clear_actors();
    }
}

export function init(metadata?: any): MosaicExtension {
    return new MosaicExtension(metadata);
}