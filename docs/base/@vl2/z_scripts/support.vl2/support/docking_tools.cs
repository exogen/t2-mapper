// #name = Hud Docking Support
// #version = 0.0.2
// #date = October 6, 2002
// #category = Support
// #author = Paul Tousignant
// #warrior = UberGuy (FT)
// #email = uberguy@tribalwar.com
// #web = http://scripts.tribalwar.com/uberguy
// #web = http://scripts.tribes-universe.com/uberguy
// #description = Additional events and features for docking HUDs to one another.
// #status = Beta
// #include = support/map.cs
// #include = support/vector.cs
// #include = support/callback.cs

// Key functions:

// DockManager.dock(%docker, %dside, %target, %cside, offset);
// * Docks the %dside side of the docking control (%docker) to the %tside side of the
// target control (%target). Valid values for %dside and %tside are "L", "R", "T" and "B"
// (for Left, Right, Top and Bottom).

// DockManager.undock(%docker, %axis);
// * demoves a docking entry for control %docker in the specified axis ("H" or "V" for
// Horizontal or Vertical).

// DockManager.isValidDockTarget(%docker, %target);
// * returns true if the control %target is a valid dock target for %docker.

// DockManager.updateDockedControls(%target, %axis);
// * refreshes the positions of all controls docket to control %target in the specified axis.

// Callbacks

// EventHorizMove(%name, ...)
// * The HUD with name %name had an effective change in it's horizontal postion.
// This could be caused by a call to resize(), setPosition, or setExtent. It is also
// called for setVisible, to allow HUDs to collapse.
// * This is never called for nameless GUI controls.
// * While some invocations provide other parameters besides, they are subject to
// change and should not be used in client script at this time.

// EventVertMove(%name, ...)
// * exactly the same as EventHorizMove except it is triggered for vertical moves.

// ==========================================================================================


if (!isObject(DockManager)) {
	new ScriptObject("DockManager") {
		class = "DockManager";
	};
}

DockManager.dockMap["H"] = Container::newVectorMap();
DockManager.dockMap["V"] = Container::newVectorMap();

DockManager.dockTargets["H"] = Container::newVectorMap();
DockManager.dockTargets["V"] = Container::newVectorMap();

//=============================================================================
//	New GUI control methods
//=============================================================================

function DockManager::isValidDockTarget(%this, %control, %target) {

	if (%control $= %target) {
		//error("Error: Cannot dock an object to itself");
		return false;
	}

	for (%control = %target.dockTo[%axis]; %control !$= ""; %control = %control.dockTo[%axis]) {
		//echo(%control);
		if (!stricmp(%control,%control)) {
			//error("Error: Attempt to create circular docking chain by docking" SPC %control SPC "to" SPC %target);
			return false;
		}
	}

	return true;
}

function DockManager::dock(%this, %control, %ctrlSide, %target, %tgtSide, %offset) {

	if (!%this.isValidDockTarget(%target)) return;

	%ctrlSide = strupr(%ctrlSide);
	if (strpos("TBLR", %ctrlSide) == -1) {
		error("Illegal control docking side specifier \"" @ %ctrlSide @ "\"");
		return;
	}

	%tgtSide = strupr(%tgtSide);
	if (strpos("TBLR", %tgtSide) == -1) {
		error("Illegal control docking side specifier \"" @ %ctrlSide @ "\"");
		return;
	}

	if (((%ctrlSide $= "L" || %ctrlSide $= "R") && (%tgtSide !$= "L" && %tgtSide !$= "R")) ||
		((%ctrlSide $= "T" || %ctrlSide $= "B") && (%tgtSide !$= "T" && %tgtSide !$= "B"))) {

		error("Cannot dock" SPC %ctrlSide SPC "side of" SPC %control SPC "to" SPC %tgtSide SPC "of" SPC %target);
	  	return;
	}

	if (%ctrlSide $= "L" || %ctrlSide $= "R") %axis = "H";
	else %axis = "V";

	// Can only dock to one parent - remove control from old parent.
	%info = %this.getDockInfo(%control,%axis);
	if (isObject(%info)) {
		%oldTarget = %info.control;
		if (%oldTarget !$= "") {
			%vec = %this.dockTargets[%axis].value(%oldTarget);
			if (isObject(%vec)) {
				%idx = %vec.findFirstIndex(%control);
				if (%idx >= 0) {
					%tmp = %vec.valueAt(%idx);
					if (isObject(%tmp)) %tmp.delete();
					%vec.removeAt(%idx);
				}
			}
		}
		%info.delete();
	}

	//warn("@" SPC %target);
	%this.setDockInfo(%control, %ctrlSide, %target, %tgtSide, %axis, %offset);

	//warn("*" SPC %tgtSide SPC %ctrlSide);

	%vec = %this.dockTargets[%axis].value(%target);
	if (!isObject(%vec)) {
		%vec = Container::newVector();
		%this.dockTargets[%axis].add(%target,%vec);
		//Callback.add(EventHorizMove, "GuiControl::onMove", %target, %axis);
	}
	%vec.pushBack(%control);
}

function DockManager::getDockInfo(%this, %control, %axis) {

	if ((%axis !$= "H") && (%axis !$= "V")) {
		error("DockManager::getDockInfo - > invalid axis specification \"" @ %axis @ "\".");
		return;
	}

	return %this.dockMap[%axis].value(%control);
}

function DockManager::setDockInfo(%this, %control, %ctrlSide, %target, %tgtSide, %axis, %offset) {

	if ((%axis !$= "H") && (%axis !$= "V")) {
		error("DockManager::setDockInfo - > invalid axis specification \"" @ %axis @ "\".");
		return;
	}

	%info = %this.getDockInfo(%control,%axis);
	if (!isObject(%info)) {
		%info = new ScriptObject(%axis @ "Dock_" @ %control @ "_2_" @ %target) {

			control = %control;
			ctrlSide = %ctrlSide;
			target = %target;
			tgtSide = %tgtSide;
			offset = (%offset ? %offset : 0);
		};
	}
	else {
		%info.control = %control;
		%info.ctrlSide = %ctrlSide;
		%info.target = %target;
		%info.tgtSide = %tgtSide;
		%info.offset = (%offset ? %offset : 0);
	}

	%this.dockMap[%axis].add(%control, %info);
}

function DockManager::unDock(%this, %control, %axis) {

	if ((%axis !$= "H") && (%axis !$= "V")) {
		error("DockManager::unDock - > invalid axis specification \"" @ %axis @ "\".");
		return;
	}

	%info = %this.getDockInfo(%control,%axis);
	if (isObject(%info)) {
		%this.dockMap[%axis].remove(%control);
		%vec = %this.dockTargets[%axis].value(%info.target);
		if (isObject(%vec)) {
			%vec.removeAt(%vec.findFirstIndex(%control));
		}
		%info.delete();
	}
}

function DockManager::updateDockedControls(%this, %control, %axis) {

	// Get the list of data structures describing controls docked to this parent
	// on the changed axis
	%grp = %this.dockTargets[%axis];
	if (!isObject(%grp)) return;
	%vec = %grp.value(%control);
	if (!isObject(%vec)) return;

	// Pick out each docked control and move it appropriately
	for (%i = 0; %i < %vec.size(); %i++) {
		%child = %vec.valueAt(%i);
		if (isObject(%child)) { // Don't bother going on if the HUD doesn't exist
			%info = %this.getDockInfo(%child,%axis);
			if (isObject(%info)) {
				%this.align(%child,%info.ctrlSide,%control,%info.tgtSide,%info.offset);
			}
		}
	}
}

function DockManager::onHorizMove(%this, %parent, %L, %R) {

	%this.updateDockedControls(%parent, "H");
}

function DockManager::onVertMove(%this, %parent, %T, %B) {

	%this.updateDockedControls(%parent, "V");
}

// I don't use the setPosition, etc. calls here to avoid looping
function DockManager::align(%this, %child, %childSide, %parent, %parentSide, %offset) {

	// If opposite sides are docked together, this will shove the docked hud to the OTHER side
	// of the hud it is docked to. Otherwise, it keeps it aligned.

	if (%childSide $= "T") {
		if (%parentSide $= "T")
			%child.position = %child.getLeft() SPC (%parent.getTop() + %offset);
		else //%parentSide $= "B"
			%child.position = %child.getLeft() SPC ((%parent.visible ? %parent.getBottom() : %parent.getTop()) + %offset);
	}
	else if (%childSide $= "B") {
		if (%parentSide $= "T")
			%child.position = %child.getLeft() SPC ((%parent.visible ? %parent.getTop() : %parent.getBottom()) - %child.getHeight() + %offset);
		else //%parentSide $= "B"
			%child.position = %child.getLeft() SPC (%parent.getBottom() - %child.getHeight() + %offset);
	}
	else if (%childSide $= "L") {
		if (%parentSide $= "L")
			%child.position = (%parent.getLeft() + %offset) SPC %child.getTop();
		else //%parentSide $= "R"
			%child.position = ((%parent.visible ? %parent.getRight() : %parent.getLeft()) + %offset) SPC %child.getTop();
	}
	else { //%childSide $= "R"
		if (%parentSide $= "L")
			%child.position = ((%parent.visible ? %parent.getLeft() : %parent.getRight()) - %child.getWidth() + %offset) SPC %child.getTop();
		else //"R"
			%child.position = (%parent.getRight() - %child.getWidth() + %offset) SPC %child.getTop();
	}
}

function GuiControl::getLeft(%this) {

	return getWord(%this.position,0);
}

function GuiControl::getRight(%this) {

	return getWord(%this.position,0) + getWord(%this.extent,0);
}

function GuiControl::getTop(%this) {

	return getWord(%this.position,1);
}

function GuiControl::getBottom(%this) {

	return getWord(%this.position,1) + getWord(%this.extent,1);
}

function GuiControl::getWidth(%this) {

	return getWord(%this.extent,0);
}

function GuiControl::getHeight(%this) {

	return getWord(%this.extent,1);
}

function GuiControl::setPosition2(%this, %position) {

	%this.setPosition(getWord(%position,0),getWord(%position,1));
}

function GuiControl::setExtent2(%this, %extent) {

	%this.setExtent(getWord(%extent,0),getWord(%extent,1));
}

function GuiNoMouseCtrl::getLeft(%this) {

	return GuiControl::getLeft(%this);
}

function GuiNoMouseCtrl::getRight(%this) {

	return GuiControl::getRight(%this);
}

function GuiNoMouseCtrl::getTop(%this) {

	return GuiControl::getTop(%this);
}

function GuiNoMouseCtrl::getBottom(%this) {

	return GuiControl::getBottom(%this);
}

function GuiNoMouseCtrl::getWidth(%this) {

	return GuiControl::getWidth(%this);
}

function GuiNoMouseCtrl::getHeight(%this) {

	return GuiControl::getHeight(%this);
}

function GuiNoMouseCtrl::setPosition2(%this, %position) {

	%this.setPosition(getWord(%position,0),getWord(%position,1));
}

function GuiNoMouseCtrl::setExtent2(%this, %extent) {

	%this.setExtent(getWord(%extent,0),getWord(%extent,1));
}

package DockManagerPkg {

	function GuiControl::setVisible(%this, %val) {

		%oldVal = %this.visible;
		parent::setVisible(%this,%val);
		if (%val != %oldVal) {
			%name = %this.getName();
			//if (%name !$= "") Callback.trigger("Event_"@%name@"_Vis",%flag);
			if (%name !$= "") {
				Callback.trigger("EventHorizMove",%name);
				Callback.trigger("EventVertMove", %name);
			}
		}
	}

	function GuiControl::resize(%this, %x, %y, %w, %h) {

		// This causes a UE. Apparently calling other methods from an overloaded
		// method before calling the parent is a Bad Thing. Perhaps it affects %this.
		//if (%this.getWidth()  != %w) %xChanged = true;
		//if (%this.getHeight() != %h) %yChanged = true;

		%ex = %this.extent;
		parent::resize(%this, %x, %y, %w, %h);
		%name = %this.getName();
		if (%name !$= "") {
			%xChanged = (%w != getWord(%ex,0));
			%yChanged = (%h != getWord(%ex,1));

			if (%xChanged) Callback.trigger("EventHorizMove",%name,%x, %x + %w);
			if (%yChanged) Callback.trigger("EventVertMove", %name,%y, %y + %h);
		}
	}

	function GuiControl::setPosition(%this, %x, %y) {

		%ps = %this.position;
		parent::setPosition(%this, %x, %y);
		%name = %this.getName();
		if (%name !$= "") {
			%xChanged = (%x != getWord(%ps,0));
			%yChanged = (%y != getWord(%ps,1));

			if (%xChanged) Callback.trigger("EventHorizMove",%name, %x, %this.getRight());
			if (%yChanged) Callback.trigger("EventVertMove", %name, %y, %this.getBottom());
		}
	}

	function GuiControl::setExtent(%this, %w, %h) {

		%ex = %this.extent;
		parent::setExtent(%this, %w, %h);

		%name = %this.getName();
		if (%name !$= "") {
			%xChanged = (%w != getWord(%ex,0));
			%yChanged = (%h != getWord(%ex,1));

			if (%xChanged) {
				%x = %this.getLeft();
				Callback.trigger("EventHorizMove",%name, %x, %x + %w);
			}
			if (%yChanged) {
				%y = %this.getTop();
				Callback.trigger("EventVertMove",%name, %y, %y + %h);
			}
		}
	}

	function GuiNoMouseCtrl::setVisible(%this, %val) {

		%oldVal = %this.visible;
		parent::setVisible(%this,%val);
		if (%val != %oldVal) {
			%name = %this.getName();
			//if (%name !$= "") Callback.trigger("Event_"@%name@"_Vis",%flag);
			if (%name !$= "") {
				Callback.trigger("EventHorizMove",%name);
				Callback.trigger("EventVertMove", %name);
			}
		}
	}

	function GuiNoMouseCtrl::resize(%this, %x, %y, %w, %h) {

		%ex = %this.extent;
		parent::resize(%this, %x, %y, %w, %h);
		%name = %this.getName();
		if (%name !$= "") {
			%xChanged = (%w != getWord(%ex,0));
			%yChanged = (%h != getWord(%ex,1));

			if (%xChanged) Callback.trigger("EventHorizMove",%name,%x, %x + %w);
			if (%yChanged) Callback.trigger("EventVertMove", %name,%y, %y + %h);
		}
	}

	function GuiNoMouseCtrl::setPosition(%this, %x, %y) {

		%ps = %this.position;
		%this.position = (%x SPC %y);
		%name = %this.getName();
		if (%name !$= "") {
			%xChanged = (%x != getWord(%ps,0));
			%yChanged = (%y != getWord(%ps,1));

			if (%xChanged) Callback.trigger("EventHorizMove",%name, %x, %this.getRight());
			if (%yChanged) Callback.trigger("EventVertMove", %name, %y, %this.getBottom());
		}
	}

	function GuiNoMouseCtrl::setExtent(%this, %w, %h) {

		%ex = %this.extent;
		%this.extent = (%w SPC %h);

		%name = %this.getName();
		if (%name !$= "") {
			%xChanged = (%w != getWord(%ex,0));
			%yChanged = (%h != getWord(%ex,1));

			if (%xChanged) {
				%x = %this.getLeft();
				Callback.trigger("EventHorizMove",%name, %x, %x + %w);
			}
			if (%yChanged) {
				%y = %this.getTop();
				Callback.trigger("EventVertMove",%name, %y, %y + %h);
			}
		}
	}

	function playGui::add(%this, %ctrl) {

		parent::add(%this,%ctrl);
		Callback.trigger("EventHorizMove",%name, %ctrl.getLeft(), %ctrl.getRight());
		Callback.trigger("EventVertMove", %name, %ctrl.getTop(), %ctrl.getBottom());
	}
};

activatePackage(DockManagerPkg);

Callback.add(EventHorizMove,"DockManager.onHorizMove");
Callback.add(EventVertMove,"DockManager.onVertMove");