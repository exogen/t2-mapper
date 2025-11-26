// Weapon bonuses


// Weapon speed
$WeaponSpeedBonusList = new ScriptObject() {
   class = WeaponSpeedBonusList;
};

function WeaponSpeedBonusList::get(%this, %a)
{
   return $WeaponSpeedBonusList[%a];
}

$WeaponSpeedBonusList[0] = new ScriptObject() {
   text = "Kilo";
   value = 1;
   sound = "blah.wav";
   emitter = "Optional";
   class = BonusComponent;
};

$WeaponSpeedBonusList[1] = new ScriptObject() {
   text = "Mega";
   value = 3;
   sound = "blah.wav";
   emitter = "Optional";
   class = BonusComponent;
};

$WeaponSpeedBonusList[2] = new ScriptObject() {
   text = "Giga";
   value = 5;
   sound = "blah.wav";
   emitter = "Optional";
   class = BonusComponent;
};

// Weapon height
$WeaponHeightBonusList = new ScriptObject() {
   class = WeaponHeightBonusList;
};

function WeaponHeightBonusList::get(%this, %a)
{
   return $WeaponHeightBonusList[%a];
}

$WeaponHeightBonusList[0] = new ScriptObject() {
   text = "Hovering";
   value = 1;
   sound = "blah.wav";
   emitter = "Optional";
   class = BonusComponent;
};

$WeaponHeightBonusList[1] = new ScriptObject() {
   text = "Towering";
   value = 3;
   sound = "blah.wav";
   emitter = "Optional";
   class = BonusComponent;
};

$WeaponHeightBonusList[3] = new ScriptObject() {
   text = "Nose-Bleeding";
   value = 5;
   sound = "blah.wav";
   emitter = "Optional";
   class = BonusComponent;
};

// Weapon type
$WeaponTypeBonusList = new ScriptObject() {
   class = WeaponTypeBonusList;
};

function WeaponTypeBonusList::get(%this, %a)
{
   return $WeaponTypeBonusList[%a];
}

$WeaponTypeBonusList[0] = new ScriptObject() {
   text = "Disc";
   value = 3;
   sound = "blah.wav";
   emitter = "Optional";
   class = BonusComponent;
};

$WeaponTypeBonusList[1] = new ScriptObject() {
   text = "Grenade";
   value = 1;
   sound = "blah.wav";
   emitter = "Optional";
   class = BonusComponent;
};

$WeaponTypeBonusList[2] = new ScriptObject() {
   text = "Chain";
   value = 2;
   sound = "blah.wav";
   emitter = "Optional";
   class = BonusComponent;
};
