import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let boxes: St.BoxLayout[] = [];

export function rect(x: number, y: number, width: number, height: number): void {
    const box = new St.BoxLayout({ style_class: "feedforward" });
    box.x = x;
    box.y = y;
    box.width = width;
    box.height = height;
    boxes.push(box);
    Main.uiGroup.add_child(box);
}

export function remove_boxes(): void {
    for(let box of boxes)
        Main.uiGroup.remove_child(box);
    boxes = [];
}

export function clear_actors(): void {
    remove_boxes();
}