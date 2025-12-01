// #name = Data Struct - Vector
// #version = 1.0.3
// #date = July 15, 2001
// #category = Support
// #author = Paul Tousignant
// #warrior = UberGuy (FT)
// #email = uberguy@tribalwar.com
// #web = http://scripts.tribalwar.com/uberguy
// #web = http://scripts.tribes-universe.com/uberguy
// #description = Structure for fast adds and indexed lookup.
// #status = Release

function Container::newVector() {

    %x = new ScriptObject() {
        class = Vector;
        lastIndex = -1;
    };
    return %x;
}

function Vector::pushFront(%this, %value) {

	%this.insertBefore(0,%value);
}

function Vector::popFront(%this) {

	%val = %this.array[0];
	%this.removeAt(0);
	return %val;
}

function Vector::pushBack(%this, %value) {

	%this.lastIndex++;
	%this.array[%this.lastIndex] = %value;
	return %this.lastIndex;
}

function Vector::popBack(%this) {

	%val = %this.array[%this.lastIndex];
	%this.array[%this.lastIndex] = "";
	%this.lastIndex--;
	return %val;
}

function Vector::insertBefore(%this, %idx, %value) {

	%this.lastIndex++;
	if (%idx < %this.lastIndex && %idx >= 0) {
		for(%i=%this.lastIndex;%i>%idx;%i--) {
			%this.array[%i] = %this.array[%i-1];
		}
		%this.array[%idx] = %value;
		return %idx;
	}
	else {
		%this.pushBack(%value);
		return %this.lastIndex;
	}
}

function Vector::insertAfter(%this, %idx, %value) {

	if (%idx < %this.lastIndex && %idx >= 0) {
		%this.insertBefore(%idx++);
		return %idx;
	}
	else {
		%this.pushBack(%value);
		return %this.lastIndex;
	}
}

function Vector::removeAt(%this, %idx) {

	if (%idx <= %this.lastIndex && %idx >= 0) {
		for (%i=%idx;%i<%this.lastIndex;%i++) {
			%this.array[%i] = %this.array[%i+1];
		}
		%this.array[%this.lastIndex] = "";
	}
	%this.lastIndex--;
}

function Vector::valueAt(%this, %idx) {

	return %this.array[%idx];
}

function Vector::clear(%this) {

	for(%i=0;%i<=%this.lastIndex;%i++) {
		%this.array[%i] = "";
	}
	%this.lastIndex = -1;
}

function Vector::size(%this) {

	return %this.lastIndex+1;
}

function Vector::findFirstIndex(%this, %value, %offset) {

	if (%offset $= "") %offset = 0;
	for(%i=%offset;%i<=%this.lastIndex;%i++) {
		if (%this.array[%i] $= %value) return %i;
	}
	return -1;
}
