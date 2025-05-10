import * as Y from 'yjs';
import {yCollab} from 'y-codemirror.next';
import {connect} from './connect';
import * as awarenessProtocol from "y-protocols/awareness";

export function cmCollab({awareness, component}: {
    awareness: awarenessProtocol.Awareness,
    component: Y.Text
})  {
 
    const undoManager = new Y.UndoManager(component);

    // Add collaboration extension to editor
    return yCollab(
        component,
        awareness,
        {undoManager: undoManager}
    );

}