import Meta from 'gi://Meta';
import * as tiling from './tiling.js';
import * as windowing from './windowing.js';

interface Cursor {
    x: number;
    y: number;
}

interface WindowFrame {
    x: number;
    y: number;
    width: number;
    height: number;
    id: number;
}

let drag_start: boolean = false;
let drag_timeout: number | undefined;

export function cursor_distance(cursor: Cursor, frame: WindowFrame): number {
    let x = cursor.x - (frame.x + frame.width / 2);
    let y = cursor.y - (frame.y + frame.height / 2);
    return Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
}

export function drag(meta_window: Meta.Window, child_frame: any, id: number, windows: WindowFrame[]): void {
    let workspace = meta_window.get_workspace();
    let monitor = meta_window.get_monitor();

    let _cursor = global.get_pointer();
    let cursor: Cursor = {
        x: _cursor[0],
        y: _cursor[1]
    };

    let minimum_distance = Infinity;
    let target_id: number | null = null;
    for(let window of windows) {
        let distance = cursor_distance(cursor, window);
        if(distance < minimum_distance)
        {
            minimum_distance = distance;
            target_id = window.id;
        }
    }

    // Check intersection with original window position
    if(target_id === id || target_id === null)
        tiling.clear_tmp_swap();
    else
        tiling.set_tmp_swap(id, target_id);

    if(tiling.tile_workspace_windows(workspace, null, monitor, false)) {
        tiling.clear_tmp_swap();
        tiling.tile_workspace_windows(workspace, null, monitor, false);
    }

    if(drag_start)
        drag_timeout = setTimeout(() => { drag(meta_window, child_frame, id, windows); }, 50) as any;
}

export function start_drag(meta_window: Meta.Window): void {
    let workspace = meta_window.get_workspace();
    let monitor = meta_window.get_monitor();
    let meta_windows = windowing.get_monitor_workspace_windows(workspace, monitor);
    tiling.apply_swaps(workspace, meta_windows);
    let descriptors = tiling.windows_to_descriptors(meta_windows, monitor);

    tiling.create_mask(meta_window);
    tiling.clear_tmp_swap();

    drag_start = true;
    drag(meta_window, meta_window.get_frame_rect(), meta_window.get_id(), JSON.parse(JSON.stringify(descriptors)));
}

export function stop_drag(meta_window: Meta.Window, skip_apply?: boolean): void {
    let workspace = meta_window.get_workspace();
    drag_start = false;
    if (drag_timeout) {
        clearTimeout(drag_timeout as any);
        drag_timeout = undefined;
    }
 
    tiling.destroy_masks();
    if(!skip_apply)
        tiling.apply_tmp_swap(workspace);
    tiling.clear_tmp_swap();
    tiling.tile_workspace_windows(workspace, null, meta_window.get_monitor(), false);
}