function SelectableActions() {
    this.selectedListeners = [];
    this.deselectedListeners = [];
};

SelectableActions.prototype.addOnSelectedListener = function(callback) {
    this.selectedListeners.push(callback);
};

SelectableActions.prototype.addOnDeselectedListener = function(callback) {
    this.deselectedListeners.push(callback);
};

SelectableActions.prototype.notifyOnSelectedListeners = function(selectableItem) {
    this.selectedListeners.forEach(function(callback) {
        callback(selectableItem);
    });
};

SelectableActions.prototype.notifyOnDeselectedListeners = function (selectableItem) {
    this.deselectedListeners.forEach(function (callback) {
        callback(selectableItem);
    });
};

SelectableActions.prototype.removeSelectable = function(selectableItem) {
    document.querySelector(".selectables-container").removeChild(selectableItem);
};

$(function () {
    $(".selectable-block .checkmark-button").click(function(e) {
        if (e.target.classList.contains("selected")) {
            e.target.classList.remove("selected");
            e.target.parentElement.classList.remove("selected");
            selectableActions.notifyOnDeselectedListeners(e.target.parentElement);
        } else {
            e.target.classList.add("selected");
            e.target.parentElement.classList.add("selected");
            selectableActions.notifyOnSelectedListeners(e.target.parentElement);
        }
    });
});

window.selectableActions = new SelectableActions();