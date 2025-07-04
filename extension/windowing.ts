import Meta from 'gi://Meta';
import * as tiling from './tiling.js';

function get_timestamp(): number {
    return global.get_current_time();
}

function get_primary_monitor(): number {
    return global.display.get_primary_monitor();
}

export function get_workspace(): Meta.Workspace {
    return global.workspace_manager.get_active_workspace();
}

function get_all_windows(): Meta.Window[] {
    return global.display.list_all_windows();
}

function get_focused_window(): Meta.Window | undefined {
    let windows = get_all_windows();
    for(let window of windows) {
        if(window.has_focus())
            return window;
    }
    return undefined;
}

function get_all_workspace_windows(monitor: number, allow_unrelated?: boolean): Meta.Window[] {
    return get_monitor_workspace_windows(get_workspace(), monitor, allow_unrelated);
}

export function get_monitor_workspace_windows(workspace: Meta.Workspace, monitor: number, allow_unrelated?: boolean): Meta.Window[] {
    let _windows: Meta.Window[] = [];
    let windows = workspace.list_windows();
    for(let window of windows)
        if(window.get_monitor() === monitor && (is_related(window) || allow_unrelated))
            _windows.push(window);
    return _windows;
}

function get_index(window: Meta.Window): number | null {
    let id = window.get_id();
    let meta_windows = get_monitor_workspace_windows(window.get_workspace(), window.get_monitor());
    for(let i = 0; i < meta_windows.length; i++)
        if(meta_windows[i].get_id() === id)
            return i;
    return null;
}

export function move_back_window(window: Meta.Window): Meta.Workspace | undefined {
    let workspace = window.get_workspace();
    let active = workspace.active;
    let previous_workspace = workspace.get_neighbor(Meta.MotionDirection.LEFT);
    if(!previous_workspace) {
        console.error("There is no workspace to the left.");
        return undefined;
    }
    if(!tiling.window_fits(window, previous_workspace, window.get_monitor())) // Make sure there is space for the window in the previous workspace
        return workspace;
    window.change_workspace(previous_workspace); // Move window to previous workspace
    if(active)
        previous_workspace.activate(get_timestamp()); // Switch to it
    return previous_workspace;
}

export function move_oversized_window(window: Meta.Window): Meta.Workspace {
    let previous_workspace = window.get_workspace();
    let focus = previous_workspace.active;
    let new_workspace = global.workspace_manager.append_new_workspace(focus, get_timestamp());
    let monitor = window.get_monitor();

    window.change_workspace(new_workspace);
    global.workspace_manager.reorder_workspace(new_workspace, previous_workspace.index() + 1);
    
    setTimeout(() => {
        tiling.tile_workspace_windows(new_workspace, window, null, true); // Tile new workspace for window

        if(window.maximized_horizontally && window.maximized_vertically) { // Adjust the window positioning if it is maximized
            let offset = global.display.get_monitor_geometry(monitor).height - previous_workspace.get_work_area_for_monitor(monitor).height; // Get top bar offset (if applicable)
            let frame = window.get_frame_rect();
            window.move_resize_frame(false, 0, offset, frame.width, frame.height - offset); // Move window to display properly
        }
        
        if(focus)
            window.focus(get_timestamp());
    }, 50);

    return new_workspace;
}

export function is_primary(window: Meta.Window): boolean {
    if(window.get_monitor() === get_primary_monitor())
        return true;
    return false;
}

export function is_excluded(meta_window: Meta.Window): boolean {
    if( !is_related(meta_window) ||
        meta_window.is_hidden()
    )
        return true;
    return false;
}

export function is_related(meta_window: Meta.Window): boolean {
    if( !meta_window.is_attached_dialog() &&
        meta_window.window_type === Meta.WindowType.NORMAL &&
        !meta_window.is_on_all_workspaces()
    ) return true;
    return false;
}

export function renavigate(workspace: Meta.Workspace, condition: boolean): void {
    let previous_workspace = workspace.get_neighbor(Meta.MotionDirection.LEFT);

    if(previous_workspace === null || previous_workspace.index() === workspace.index()) {
        previous_workspace = workspace.get_neighbor(Meta.MotionDirection.RIGHT); // The new workspace will be the one on the right instead.
        // Recheck to see if it is still a problematic workspace
        if( previous_workspace === null ||
            previous_workspace.index() === workspace.index() ||
            previous_workspace.index() === global.workspace_manager.get_n_workspaces() - 1)
            return;
    }
    
    if( condition &&
        workspace.index() !== global.workspace_manager.get_n_workspaces() - 1)
    {
        previous_workspace.activate(get_timestamp());
    }
}