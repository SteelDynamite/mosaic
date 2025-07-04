import Meta from 'gi://Meta';
import * as enums from './enums.js';
import * as windowing from './windowing.js';
import * as reordering from './reordering.js';
import * as drawing from './drawing.js';

interface WindowDescriptor {
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
    id: number;
    draw(meta_windows: Meta.Window[], x: number, y: number): void;
}

interface TileInfo {
    x: number;
    y: number;
    overflow: boolean;
    vertical: boolean;
    levels: Level[];
}

interface WorkingInfo {
    monitor: number;
    meta_windows: Meta.Window[];
    windows: (WindowDescriptor | Mask)[];
    work_area: any;
}

let masks: { [key: number]: boolean } = {};
let working_windows: WindowDescriptor[] = [];
let tmp_swap: number[] = [];

class window_descriptor implements WindowDescriptor {
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
    id: number;

    constructor(meta_window: Meta.Window, index: number) {
        let frame = meta_window.get_frame_rect();

        this.index = index;
        this.x = frame.x;
        this.y = frame.y;
        this.width = frame.width;
        this.height = frame.height;
        this.id = meta_window.get_id();
    }

    draw(meta_windows: Meta.Window[], x: number, y: number): void {
        meta_windows[this.index].move_frame(false, x, y);
    }
}

function create_descriptor(meta_window: Meta.Window, monitor: number, index: number, reference_window?: Meta.Window): window_descriptor | false {
    // If the input window is the same as the reference, make a descriptor for it anyways
    if(reference_window)
        if(meta_window.get_id() === reference_window.get_id())
            return new window_descriptor(meta_window, index);
    
    if( windowing.is_excluded(meta_window) ||
        meta_window.get_monitor() !== monitor ||
        (meta_window.maximized_horizontally && meta_window.maximized_vertically))
        return false;
    return new window_descriptor(meta_window, index);
}

export function windows_to_descriptors(meta_windows: Meta.Window[], monitor: number, reference_window?: Meta.Window): WindowDescriptor[] {
    let descriptors: WindowDescriptor[] = [];
    for(let i = 0; i < meta_windows.length; i++) {
        let descriptor = create_descriptor(meta_windows[i], monitor, i, reference_window);
        if(descriptor)
            descriptors.push(descriptor);
    }
    return descriptors;
}

class Level {
    x: number = 0;
    y: number = 0;
    width: number = 0;
    height: number = 0;
    windows: (WindowDescriptor | Mask)[] = [];
    work_area: any;

    constructor(work_area: any) {
        this.work_area = work_area;
    }

    draw_horizontal(meta_windows: Meta.Window[], work_area: any, y: number): void {
        let x = this.x;
        for(let window of this.windows) {
            let center_offset = (work_area.height / 2 + work_area.y) - (y + window.height / 2);
            let y_offset = 0;
            if(center_offset > 0)
                y_offset = Math.min(center_offset, this.height - window.height);

            window.draw(meta_windows, x, y + y_offset);
            x += window.width + enums.window_spacing;
        }
    }
}

function tile(windows: (WindowDescriptor | Mask)[], work_area: any): TileInfo {
    let vertical = false;
    {
        let width = 0;
        let height = 0;
        for(let window of windows) {
            width = Math.max(window.width, width);
            height = Math.max(window.height, height);
        }
        // if(width < height)
        //     vertical = true;
    }
    let levels = [new Level(work_area)];
    let total_width = 0;
    let total_height = 0;
    let x: number, y: number;

    let overflow = false;

    if(!vertical) { // If the mode is going to be horizontal
        let window_widths = 0;
        windows.map(w => window_widths += w.width + enums.window_spacing);
        window_widths -= enums.window_spacing;

        let n_levels = Math.round(window_widths / work_area.width) + 1;
        let avg_level_width = window_widths / n_levels;
        let level = levels[0];
        let level_index = 0;
        
        for(let window of windows) { // Add windows to levels
            if(level.width + enums.window_spacing + window.width > work_area.width) { // Create a new level
                total_width = Math.max(level.width, total_width);
                total_height += level.height + enums.window_spacing;
                level.x = (work_area.width - level.width) / 2 + work_area.x;
                levels.push(new Level(work_area));
                level_index++;
                level = levels[level_index];
            }
            if( Math.max(window.height, level.height) + total_height > work_area.height || 
                window.width + level.width > work_area.width){
                overflow = true;
                continue;
            }
            level.windows.push(window);
            if(level.width !== 0)
                level.width += enums.window_spacing;
            level.width += window.width;
            level.height = Math.max(window.height, level.height);
        }
        total_width = Math.max(level.width, total_width);
        total_height += level.height;
        level.x = (work_area.width - level.width) / 2 + work_area.x;

        y = (work_area.height - total_height) / 2 + work_area.y;
    } else {
        let window_heights = 0;
        windows.map(w => window_heights += w.height + enums.window_spacing);
        window_heights -= enums.window_spacing;

        let n_levels = Math.floor(window_heights / work_area.height) + 1;
        let avg_level_height = window_heights / n_levels;
        let level = levels[0];
        let level_index = 0;
        
        for(let window of windows) { // Add windows to levels
            if(level.width > avg_level_height) { // Create a new level
                total_width = Math.max(level.width, total_width);
                total_height += level.height + enums.window_spacing;
                level.x = (work_area.width - level.width) / 2 + work_area.x;
                levels.push(new Level(work_area));
                level_index++;
                level = levels[level_index];
            }
            level.windows.push(window);
            if(level.width !== 0)
                level.width += enums.window_spacing;
            level.width += window.width;
            level.height = Math.max(window.height, level.height);
        }
        total_width = Math.max(level.width, total_width);
        total_height += level.height;
        level.x = (work_area.width - level.width) / 2 + work_area.x;

        y = (work_area.height - total_height) / 2 + work_area.y;
    }
    return {
        x: x!,
        y: y,
        overflow: overflow,
        vertical: vertical,
        levels: levels
    };
}

function swap_elements(array: any[], index1: number, index2: number): void {
    if(!array[index1] || !array[index2])
        return; // Prevent making swaps for elements that do not exist
    let tmp = array[index1];
    array[index1] = array[index2];
    array[index2] = tmp;
}

export function set_tmp_swap(id1: number, id2: number): void {
    let index1: number | null = null;
    let index2: number | null = null;

    for(let i = 0; i < working_windows.length; i++) {
        let window = working_windows[i];
        if(window.id === id1 && index1 === null)
            index1 = i;
        if(window.id === id2 && index2 === null)
            index2 = i;
    }
    if(index1 !== null && index2 !== null) {
        if( index1 === index2 ||
            (tmp_swap[0] === index2 && tmp_swap[1] === index1))
            return;
        tmp_swap = [index1, index2];
    } else
        console.error("Could not find both indexes for windows");
}

export function clear_tmp_swap(): void {
    tmp_swap = [];
}

export function apply_tmp_swap(workspace: Meta.Workspace & { swaps?: number[][] }): void {
    if(!workspace.swaps)
        workspace.swaps = [];
    if(tmp_swap.length !== 0)
        workspace.swaps.push(tmp_swap);
}

export function apply_swaps(workspace: Meta.Workspace & { swaps?: number[][] }, array: any[]): void {
    if(workspace.swaps)
        for(let swap of workspace.swaps)
            swap_elements(array, swap[0], swap[1]);
}

export function apply_tmp(array: any[]): void {
    if(tmp_swap.length !== 0)
        swap_elements(array, tmp_swap[0], tmp_swap[1]);
}

function get_working_info(workspace: Meta.Workspace, window: Meta.Window | null, monitor: number | null): WorkingInfo | false {
    if(!workspace) // Failsafe for undefined workspace
        return false;

    let current_monitor: number | null = null;
    if(window)
        current_monitor = window.get_monitor();
    else
        current_monitor = monitor;
    if(current_monitor === null)
        return false;

    let meta_windows = windowing.get_monitor_workspace_windows(workspace, current_monitor);

    // Put needed window info into an enum so it can be transferred between arrays
    let _windows = windows_to_descriptors(meta_windows, current_monitor, window || undefined);
    // Apply window layout swaps
    apply_swaps(workspace as Meta.Workspace & { swaps?: number[][] }, _windows);
    working_windows = [];
    _windows.map(window => working_windows.push(window)); // Set working windows before tmp application
    apply_tmp(_windows);
    // Apply masks
    let windows: (WindowDescriptor | Mask)[] = [];
    for(let window of _windows)
        windows.push(get_mask(window));

    let work_area = workspace.get_work_area_for_monitor(current_monitor); // Get working area for current space
    if(!work_area) return false;

    return {
        monitor: current_monitor,
        meta_windows: meta_windows,
        windows: windows,
        work_area: work_area
    };
}

function draw_tile(tile_info: TileInfo, work_area: any, meta_windows: Meta.Window[]): void {
    let levels = tile_info.levels;
    let _x = tile_info.x;
    let _y = tile_info.y;
    if(!tile_info.vertical) { // Horizontal tiling
        let y = _y;
        for(let level of levels) {
            level.draw_horizontal(meta_windows, work_area, y);
            y += level.height + enums.window_spacing;
        }
    } else { // Vertical
        let x = _x;
        for(let level of levels) {
            // level.draw_vertical(meta_windows, x);
            x += level.width + enums.window_spacing;
        }
    }
}

class Mask {
    x: number;
    y: number;
    width: number;
    height: number;

    constructor(window: WindowDescriptor) {
        this.x = window.x;
        this.y = window.y;
        this.width = window.width;
        this.height = window.height;
    }

    draw(_: Meta.Window[], x: number, y: number): void {
        drawing.remove_boxes();
        drawing.rect(x, y, this.width, this.height);
    }
}

export function create_mask(meta_window: Meta.Window): void {
    masks[meta_window.get_id()] = true;
}

export function destroy_masks(): void {
    drawing.remove_boxes();
    masks = {};
}

export function get_mask(window: WindowDescriptor): WindowDescriptor | Mask {
    if(masks[window.id])
        return new Mask(window);
    return window;
}

export function tile_workspace_windows(workspace: Meta.Workspace, reference_meta_window: Meta.Window | null, _monitor: number | null, keep_oversized_windows: boolean): boolean {
    let working_info = get_working_info(workspace, reference_meta_window, _monitor);
    if(!working_info) return false;
    let meta_windows = working_info.meta_windows;
    let windows = working_info.windows;
    let work_area = working_info.work_area;
    let monitor = working_info.monitor;

    const workspace_windows = windowing.get_monitor_workspace_windows(workspace, monitor);
    
    let tile_info = tile(windows, work_area);
    let overflow = tile_info.overflow;
    for(let window of windowing.get_monitor_workspace_windows(workspace, monitor))
        if(window.maximized_horizontally && window.maximized_vertically)
            overflow = true;

    if (workspace_windows.length <= 1) {
        overflow = false;
    } else {
        for(let window of workspace_windows)
            if(window.maximized_horizontally && window.maximized_vertically)
                overflow = true;
    }
    
    if(overflow && !keep_oversized_windows && reference_meta_window) { // Overflow clause
        let id = reference_meta_window.get_id();
        let _windows = windows;
        for(let i = 0; i < _windows.length; i++) {
            if(meta_windows[(_windows[i] as WindowDescriptor).index].get_id() === id) {
                _windows.splice(i, 1);
                break;
            }
        }
        windowing.move_oversized_window(reference_meta_window);
        tile_info = tile(_windows, work_area);
    }
    draw_tile(tile_info, work_area, meta_windows);
    return overflow;
}

export function window_fits(window: Meta.Window, workspace: Meta.Workspace, monitor: number): boolean {
    let working_info = get_working_info(workspace, window, monitor);
    if(!working_info) return false;
    if(workspace.index() === window.get_workspace().index()) return true;

    let windows = working_info.windows;
    windows.push(new window_descriptor(window, windows.length));

    for(let window of working_info.meta_windows)
        if(window.maximized_horizontally && window.maximized_vertically)
            return false;

    return !(tile(windows, working_info.work_area).overflow);
}