//
// PathEdit.cs
//
function PathEdit::initInteriorEditor()
{
   echo("interior editor startup...");
   aiEdit.setPathMode();
   new ActionMap(PathEditMap);
   PathEditMap.bindCmd(keyboard, g, "PathEdit::grabNode();", "");
   PathEditMap.bindCmd(keyboard, f, "PathEdit::dropNode();", "");
   PathEditMap.bindCmd(keyboard, u, "PathEdit::undoNodeGrab();", "");
   PathEditMap.bindCmd(keyboard, t, "PathEdit::createEdge();", "");
   PathEditMap.bindCmd(keyboard, r, "PathEdit::connectEdge();", "");
   PathEditMap.bindCmd(keyboard, "alt r", "PathEdit::grabEdge();", "");
   PathEditMap.bindCmd(keyboard, "alt t", "PathEdit::deleteEdge();", "");
   PathEditMap.bindCmd(keyboard, "alt g", "PathEdit::deleteNode();", "");
   PathEditMap.bindCmd(keyboard, "alt d", "PathEdit::beginEnd();", "");
   PathEditMap.bindCmd(keyboard, "j", "PathEdit::setJet();", "");
   PathEditMap.bindCmd(keyboard, "alt j", "PathEdit::setNotJet();", "");
   PathEditMap.bindCmd(keyboard, "alt s", "PathEdit::saveGraph();", "");
   PathEditMap.bindCmd(keyboard, "h", "PathEdit::createNode();", "");
   PathEditMap.push();
}

//------------------------------------------------------------------------------

function PathEdit::closeInteriorEdit()
{
   aiEdit.setUninitMode();
   PathEditMap.pop();
}

//------------------------------------------------------------------------------

function PathEdit::grabNode()
{
   aiEdit.grabNode();
}

//-------------------------------------------------

function PathEdit::createNode()
{
   aiEdit.createNode();
}

//-------------------------------------------------

function PathEdit::grabEdge()
{
   aiEdit.grabEdge();
}

//-------------------------------------------------

function PathEdit::dropNode()
{
   aiEdit.placeNode();
}

//-------------------------------------------------

function PathEdit::undoNodeGrab()
{
   aiEdit.putBackNode();
}

//-------------------------------------------------

function PathEdit::deleteNode()
{  
   aiEdit.deleteNode();
}

//-------------------------------------------------

function PathEdit::deleteEdge()
{  
   aiEdit.deleteEdge();
}

//-------------------------------------------------

function PathEdit::createEdge()
{
   aiEdit.createEdge();
}

//-------------------------------------------------

function PathEdit::connectEdge()
{
   aiEdit.connectEdge();
}

//-------------------------------------------------

function PathEdit::setJet()
{
   aiEdit.setJetting(true);
}

//-------------------------------------------------

function PathEdit::setNotJet()
{
   aiEdit.setJetting(false);
}

//-------------------------------------------------
