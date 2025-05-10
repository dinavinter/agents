import * as Y from 'yjs';
import {HocuspocusProvider} from '@hocuspocus/provider';
import {yCollab} from 'y-codemirror.next';
import * as awarenessProtocol from "y-protocols/awareness";

const defaults = {
    url: "ws://localhost:1234",
    room: "default"
};

export function cmCollab({url, room, component}: {
    url?: string,
    room?: string,
    component?: string
} = defaults): ReturnType<typeof yCollab> {


    const doc = new Y.Doc({guid: room})
    const awareness = new awarenessProtocol.Awareness(doc)


    const provider = new HocuspocusProvider({
        url: url || defaults.url,
        name: room || defaults.room,
        document: doc,
        awareness,
        connect: true
    });


    // Set up undo manager
    const undoManager = new Y.UndoManager(provider.document.getText(component));

    // Add collaboration extension to editor
    return yCollab(
        provider.document.getText(component),
        provider.awareness,
        {undoManager: undoManager}
    );

}