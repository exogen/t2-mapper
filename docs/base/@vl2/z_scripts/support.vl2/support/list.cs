// #name = Data Struct - Linked List
// #version = 1.0.1
// #date = July 15, 2001
// #category = Support
// #author = Paul Tousignant
// #warrior = UberGuy (FT)
// #email = uberguy@tribalwar.com
// #web = http://scripts.tribalwar.com/uberguy
// #web = http://scripts.tribes-universe.com/uberguy
// #description = Structure for fast adds and removes.
// #status = Release

// It breaks ::delete() to have the class have a constructor function
// in it's own namespace.  So I put it in another one...

function Container::newList() {

    %x = new ScriptObject() {
        class = List;
        head = "";
        tail = "";
        length = 0;
    };
    return %x;
}

function List::newNode(%this) {

    %x = new ScriptObject() {
        class = ListNode;
        next = "";
        prev = "";
        value = "";
    };
    return %x;
}

//function ListNode::delete(%this, %flag) {
//
//	if (!%flag) {
//		if (isObject(%this.value)) {
//			%this.value.delete();
//		}
//    	%this.schedule(10,delete,1);
//    }
//    else parent::delete(%this);
//}


function List::removeAt(%this, %node) {

	if (%node.class !$= ListNode) return;

	if (%node.prev !$= "")
		%node.prev.next = %node.next;

	if (%node.next !$="")
		%node.next.prev = %node.prev;

	if (%node == %this.head) %this.head = %node.next;
	if (%node == %this.tail) %this.tail = %node.prev;

	%node.delete();

	%this.length--;
}

function List::clear(%this) {

	%node=%this.head;
	while (%node !$= "") {
		%tmp = %node;
		%node = %node.next;
		%tmp.delete();
	}
}

function List::delete(%this,%flag) {

	// The format here is VERY STRANGE.
	// the scheduled callback is needed to keep this from crashing T2.
	// Apparently it is bad for ::delete() to do work AND call its parent.
	// So I do the work, leave, then come back to call the parent, and that works.
	// Very, very ugly, and possibly a bug in T2.

	if (!%flag) {
		%this.clear();
    	%this.schedule(1,delete,1);
    }
    else parent::delete(%this);
}

function List::nodeAt(%this, %index) {

	if (%index < 0 || %index >= %this.length) return "";
	if (%index <= %this.length /2) {
		for(%node=%this.head; %node !$= ""; %node=%node.next) {
			if (%index == 0) return %node;
			%index--;
		}
	}
	else {
		%idx = %this.length - %index - 1;
		for(%node=%this.tail; %node !$= ""; %node=%node.prev) {
			if (%idx == 0) return %node;
			%idx--;
		}
	}
}

function List::valueAt(%this, %index) {

	return %this.nodeAt(%index).value;
}

function List::insertAfter(%this, %node, %value) {

	if (%node.class !$= "ListNode") return;

	%newNode = %this.newNode();
	%newNode.value = %value;

	if (%node.next !$= "") {
		%node.next.prev = %newNode;
	}
	%newNode.next = %node.next;

	%node.next = %newNode;
	%newNode.prev = %node;

	if (%node == %this.tail) %this.tail = %newNode;

	%this.length++;
	return %newNode;
}

function List::insertBefore(%this, %node, %value) {

	if (%node.class !$= "ListNode") return;

	%newNode = %this.newNode();
	%newNode.value = %value;

	if (%node.prev !$= "") {
		%node.prev.next = %newNode;
	}
	%newNode.prev = %node.prev;

	%node.prev = %newNode;
	%newNode.next = %node;

	if (%node == %this.head) %this.head = %newNode;

	%this.length++;
	return %newNode;
}

function List::pushBack(%this,%value) {

	%node = %this.newNode();
	%node.value = %value;

	if (%this.length == 0) {
		%this.head = %this.tail = %node;
	}
	else {
		%node.prev = %this.tail;
		%this.tail.next = %node;
		%this.tail = %node;
	}

	%this.length++;
	return %this.tail;
}

function List::pushFront(%this,%value) {

	%node = %this.newNode();
	%node.value = %value;

	if (%this.length == 0) {
		%this.head = %this.tail = %node;
	}
	else {
		%node.next = %this.head;
		%this.head.prev = %node;
		%this.head = %node;
	}

	%this.length++;
	return %this.head;
}

function List::popBack(%this) {

	if (%this.length == 0) return;

	%tmp = %this.tail.prev;
	if (%tmp !$= "") {
		%tmp.next = "";
	}
	%val = %this.tail.value;
	%this.tail.delete();
	%this.tail = %tmp;
	%this.length--;

	if (%this.length == 0) %this.head = "";
	return %val;
}

function List::popFront(%this) {

	if (%this.length == 0) return;

	%tmp = %this.head.next;
	if (%tmp !$= "") {
		%tmp.prev = "";
	}
	%val = %this.head.value;
	%this.head.delete();
	%this.head = %tmp;
	%this.length--;

	if (%this.length == 0) %this.tail = "";
	return %head;
}

function List::size(%this) {

	return %this.length;
}

function List::findFirstIndex(%this, %value, %offset) {

	if (%offset $= "") %offset = 0;
	return %this.findFirstNode(%value, %this.nodeAt(%offset));
}

function List::findFirstNode(%this, %value, %node) {

	if (%node $= "") %node = %this.head;
	else
		if (!isObject(%node) || (%node.class !$= "ListNode")) return -1;

	for(%node=%node; %node !$= ""; %node=%node.next) {
		if (%node.value $= %value) return %node;
	}
	return -1;
}	