import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
let boxes = [];
export function rect(x, y, width, height) {
    const box = new St.BoxLayout({ style_class: "feedforward" });
    box.x = x;
    box.y = y;
    box.width = width;
    box.height = height;
    boxes.push(box);
    Main.uiGroup.add_child(box);
}
export function remove_boxes() {
    for (let box of boxes)
        Main.uiGroup.remove_child(box);
    boxes = [];
}
export function clear_actors() {
    remove_boxes();
}
