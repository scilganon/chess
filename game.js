"use strict";

const cfg = {
    theme: {
        ico_path: function(name, color){
            return `./assets/Figurines/${_.capitalize(color)} ${_.capitalize(name[0])}.ico`;
        }
    }
};

const TYPE_ENUM = {
    KING: 'king',
    QUEEN: 'queen',
    PAWN: 'pawn',
    BISHOP: 'bishop',
    KNIGHT: 'knight',
    ROCK: 'rock'
};

function* TURN_ENUM(){
    var order = [
        TURN_ENUM.BLACK,
        TURN_ENUM.WHITE
    ];

    var index = 1;

    while(true){
        yield order[(++index % order.length)];
    }
}

TURN_ENUM.BLACK = 'black';
TURN_ENUM.WHITE = 'white';

function decorateCellBg(cell, x,y){
    cell.style.background = !(y%2)
        ? (x%2)
            ? 'white'
            : 'black'
        : (x%2)
            ? 'black'
            : 'white'
}

function decorateCellSize(cell, size){
    size = 50;

    cell.style.width = `${size}px`;
    cell.style.height = `${size}px`;
    cell.style.maxWidth = `${size}px`;
    cell.style.maxHeight = `${size}px`;
    cell.style.boxSizing = 'border-box';
}

/**
 * @param cfg
 * @returns {HTMLTableElement}
 */
function createTable(cfg){
    const decorators = cfg.decorators;
    const size = 8;

    /**
     * @type {HTMLTableElement}
     */
    var table = document.createElement('table');

    for(var i=0;i<size;i++){
        var row = table.insertRow(i);

        for(var j=0;j<size;j++){
            var cell = row.insertCell(j);
            (decorators || []).forEach((cb) => {
                cb(cell, j, i);
            })
        }
    }

    return table;
}

function Piece(name, color, x, y){
    this.color = color;
    this.name = name;

    this.loc = {
        x: x || 0,
        y: y || 0
    };

    Object.defineProperty(this, 'x', {
        get(){
            return this.loc.x;
        }
    });

    Object.defineProperty(this, 'y', {
        get(){
            return this.loc.y;
        }
    });

    Object.defineProperty(this, 'isRemoved', {
        get(){
            return !this.loc;
        }
    });
}

/**
 * @param {HTMLTableElement} table
 * @param {PieceCollection} list
 * @constructor
 */
function Presenter(table, list){
    this.table = table;
    this.initMap(list);
}

/**
 *
 * @param {PieceCollection} list
 */
Presenter.prototype.initMap = function(list){
    this.map = new Map();
    var aliases  = {
        [TYPE_ENUM.KNIGHT]: 'N'
    };

    list.forEach((p) => {
        let img = document.createElement('img');
        img.src = cfg.theme.ico_path(aliases[p.name] || p.name, p.color);

        this.map.set(img, p);
    });
};

Presenter.prototype.resetHighLight = function(){
    var active = document.querySelector('img.active');
    if(active){
        active.classList.remove('active');
        active.style.boxShadow = '';
    }
};

Presenter.prototype.highlight = function(img){
    var active = document.querySelector('img.active');

    if(active === img){
        return;
    }

    this.resetHighLight();

    const style = [0,0,'50px', 'red'].join(' ');

    img.classList.add('active');
    img.style.boxShadow = style;
};

/**
 * @param {Piece} piece
 * @param {HTMLImageElement} img
 */
Presenter.prototype.renderPiece = function(piece, img){
    if(piece.isRemoved){
        if(img.parentNode){
            img.style.display = 'none';
            img.parentNode.removeChild(img);
        }

        return;
    }

    this.table.rows[piece.y].cells[piece.x].appendChild(img);
};

Presenter.prototype.render = function(){
    this.map.forEach((piece, img) => {
        this.renderPiece(piece, img);
    });
};

/**
 * @param {HTMLImageElement} img
 * @returns {Piece}
 */
Presenter.prototype.getPieceByImg = function(img){
    return this.map.get(img);
};

function State(cfg){
    cfg = _.merge({
        firstTurn: TURN_ENUM.WHITE
    }, cfg);

    this.selected = false;
    this.turn = cfg.firstTurn;
    this.dest = false;

    this.used = new Set();
}

State.prototype.wasUsed = function(piece){
    return this.used.has(piece);
};

State.prototype.mark = function(piece){
    piece instanceof Piece && this.used.add(piece);
};

State.prototype.update = function(data){
    this.wasSelected = this.selected;
    _.mergeWith(this, data);

    console.log(this);
    PubSub.publish('update', this);
};

State.prototype.subscribe = function(cb){
    PubSub.subscribe('update', cb);
};

State.prototype.reset = function(){
    this.selected = false;
    this.wasSelected = false;
};

/**
 * @param {State} state
 * @param {PieceCollection} list
 * @constructor
 */
function RuleValidator(state, list){
    this.state = state;
    this.list = list;

    this.mapMove = new Map([
        [TYPE_ENUM.KING, this.kingValidation],
        [TYPE_ENUM.QUEEN, this.queenValidation],
        [TYPE_ENUM.BISHOP, this.bishopValidation],
        [TYPE_ENUM.ROCK, this.rockValidation],
        [TYPE_ENUM.PAWN, this.pawnValidationMove]
    ]);

    this.mapAttack = new Map([
        [TYPE_ENUM.KING, () => true],
        [TYPE_ENUM.QUEEN, () => true],
        [TYPE_ENUM.BISHOP, () => true],
        [TYPE_ENUM.ROCK, () => true],
        [TYPE_ENUM.PAWN, this.pawnValidationAttack]
    ]);
}

RuleValidator.prototype.getDeltaPath = function(prev, current){
    return {
        x: Math.abs(Math.abs(prev.x) - Math.abs(current.x)),
        y: Math.abs(Math.abs(prev.y) - Math.abs(current.y))
    };
};

/**
 * @param {Piece} piece
 * @param current
 * @returns {boolean}
 */
RuleValidator.prototype.queenValidation = function(piece, current){
    const prev = piece.loc;
    const delta = this.getDeltaPath(prev, current);

    var result = false;

    switch(true){
        case prev.y === current.y:
            result = this.horizontalValidation(delta.x, current, (prev.x > current.x ? -1 : 1));
            break;
        case prev.x === current.x:
            result = this.verticalValidation(delta.y, current, (prev.y > current.y ? -1 : 1));
            break;
        default:
            result = delta.x === delta.y && this.diagonalValidation(delta.x, current, (prev.x > current.x ? -1 : 1));
    }

    return result;
};

/**
 * @param {Piece} piece
 * @param current
 * @returns {boolean}
 */
RuleValidator.prototype.bishopValidation = function(piece, current){
    const prev = piece.loc;
    const delta = this.getDeltaPath(prev, current);
    const directionMod = (prev.x > current.x ? -1 : 1);

    return delta.x === delta.y && this.diagonalValidation(delta.x, current, directionMod);
};

/**
 * @param {Piece} piece
 * @param current
 * @returns {boolean}
 */
RuleValidator.prototype.rockValidation = function(piece, current){
    const prev = piece.loc;
    const delta = this.getDeltaPath(prev, current);

    var result = false;

    switch(true){
        case prev.y === current.y:
            result = this.horizontalValidation(delta.x, current, (prev.x > current.x ? -1 : 1));
            break;
        case prev.x === current.x:
            result = this.verticalValidation(delta.y, current, (prev.y > current.y ? -1 : 1));
            break;
    }

    return result;
};

/**
 * @param {Piece} piece
 * @param current
 * @returns {boolean}
 */
RuleValidator.prototype.kingValidation = function (piece, current){
    const prev = piece.loc;
    var isValidX = Math.abs(Math.abs(prev.x) - Math.abs(current.x)) <2;
    var isValidY = Math.abs(Math.abs(prev.y) - Math.abs(current.y)) <2;

    return isValidX && isValidY;
};

RuleValidator.prototype.pawnValidationMove = function(piece, current){
    const delta = this.getDeltaPath(piece.loc, current);

    const isSameX = piece.loc.x === current.x;
    const isValidY = [
            1,
            1 + !this.state.wasUsed(piece) // 1 or 2
        ].find((val) => val === delta.y);
    const isRightDirection = {
        [TURN_ENUM.BLACK]: () => piece.loc.y > current.y,
        [TURN_ENUM.WHITE]: () => piece.loc.y < current.y
    }[piece.color]();

    return this.list.isAvailableDest(current) && isRightDirection && isSameX && isValidY;
};

RuleValidator.prototype.pawnValidationAttack = function(piece, current){
    const delta = this.getDeltaPath(piece.loc, current);

    const isInRange = delta.x === 1 && delta.y === 1;
    const isDiagonal = delta.x === delta.y;
    const isRightDirection = {
        [TURN_ENUM.BLACK]: () => piece.loc.y > current.y,
        [TURN_ENUM.WHITE]: () => piece.loc.y < current.y
    }[piece.color]();

    return isRightDirection && isDiagonal && isInRange;
};

RuleValidator.prototype.horizontalValidation = function(dX, current, mod){
    for(let i= 1; i<dX-1; i++){
        let point = {
            y: current.y,
            x: current.x - i * mod
        };
        if(!this.list.isAvailableDest(point)){
            return false;
        }
    }

    return true;
};

RuleValidator.prototype.verticalValidation = function(dY, current, mod){
    for(let i= 1; i<dY-1; i++){
        let point = {
            x: current.x,
            y: current.y - i * mod
        };
        if(!this.list.isAvailableDest(point)){
            return false;
        }
    }

    return true;
};

RuleValidator.prototype.diagonalValidation = function(delta, current, mod){
    for(let i= 1; i<delta; i++){
        let point = {
            x: current.x - i * mod,
            y: current.y - i * mod
        };
        if(!this.list.isAvailableDest(point)){
            return false;
        }
    }

    return true;
};

/**
 *
 * @param {Piece} piece
 * @param {{}} dest
 */
RuleValidator.prototype.checkMove = function(piece, dest){
    return (this.mapMove.get(piece.name) || _.noop).call(this, piece, dest);
};

/**
 *
 * @param {Piece} piece
 * @param {{}} dest
 */
RuleValidator.prototype.canAttack = function(piece, dest){
    return (this.mapAttack.get(piece.name) || _.noop).call(this, piece, dest);
};

/**
 * @param {HTMLTableElement} table
 * @param {State} state
 * @constructor
 */
function InputController(table, state){
    this.state = state;

    table.addEventListener('click', (event) => {
        var cell = [event.target, event.target.parentNode].find((node) => node.tagName === 'TD');

        if(cell){
            this.handleCellClick(event, cell);
        }
    });
}

InputController.prototype.handleCellClick =  function handleCellClick(event, cell){
    this.state.update({
        dest: {
            x: cell.cellIndex,
            y: cell.parentNode.rowIndex
        },
        selected:  cell.firstChild
    })
};

/**
 * @param {State} state
 * @param {Presenter} presenter
 * @param {RuleValidator} validator
 * @constructor
 */
function TurnManager(state, presenter, validator){
    this.state = state;
    this.presenter = presenter;
    this.validator = validator;
    this.ordering = TURN_ENUM();

    this.actions = new ActionManager(state);

    state.subscribe(() => {
        var cPiece = this.presenter.getPieceByImg(this.state.selected);
        var wPiece = this.presenter.getPieceByImg(this.state.wasSelected);

        if(wPiece && (this.state.turn !== wPiece.color)){
            this.presenter.resetHighLight();
            throw new Error('not your turn');
        }

        if(this.state.selected){
            this.presenter.highlight(this.state.selected);
        } else {
            this.presenter.resetHighLight();
        }

        if(wPiece){
            if(!cPiece){
               this.runMovementStrategy(wPiece);
            } else {
                this.runInteractionStrategy(cPiece, wPiece);
            }
        }

        this.presenter.render();
    });
}

TurnManager.prototype.runMovementStrategy = function(wPiece){
    if(this.validator.checkMove(wPiece, this.state.dest)){
        this.actions.move(wPiece);
        this.switchTurn();
        this.state.mark(wPiece);
    }
};

TurnManager.prototype.runInteractionStrategy = function(cPiece, wPiece){
    var map = {
        [TYPE_ENUM.PAWN]: this.runPawnInteraction
    };

    return (map[wPiece.name] || this.runGeneralInteraction).call(this, cPiece, wPiece);
};

TurnManager.prototype.runPawnInteraction = function(cPiece, wPiece){
    if(this.validator.canAttack(wPiece, this.state.dest)){
        if(cPiece.color !== wPiece.color){
            this.actions.kill(wPiece, cPiece);
            this.switchTurn();
            this.state.mark(wPiece);
        }
    }
};

TurnManager.prototype.runGeneralInteraction = function(cPiece, wPiece){
    if(this.validator.checkMove(wPiece, this.state.dest)){
        if(this.validator.canAttack(wPiece, this.state.dest)){
            if(cPiece.color !== wPiece.color){
                this.actions.kill(wPiece, cPiece);
                this.switchTurn();
                this.state.mark(wPiece);
            }
        }
    }
};

TurnManager.prototype.switchTurn = function(){
    this.state.turn = this.ordering.next().value;
};

function ActionManager(state){
    this.state = state;
}

ActionManager.prototype.move = function(piece){
    _.mergeWith(piece.loc, this.state.dest);
};

/**
 * @param {Piece} killer
 * @param {Piece} target
 */
ActionManager.prototype.kill = function(killer, target){
    _.mergeWith(killer.loc, this.state.dest);
    delete target.loc;
    this.state.reset();
};

function PieceCollection(list){
    this.list = list;

    this.forEach = this.list.forEach.bind(this.list);
}

/**
 * @param {{}} dest
 * @returns {Boolean}
 */
PieceCollection.prototype.isAvailableDest = function(dest){
    return !this.getAvailableList()
        .reduce((result, piece) => {
            return result || _.isEqual(dest, piece.loc);
        }, false);
};

PieceCollection.prototype.getAvailableList = function(){
    return this.list.filter((piece) => !!piece.loc);
};

//prepare
var table = createTable({
    decorators: [
        decorateCellBg,
        decorateCellSize
    ]
});

document.body.appendChild(table);

//run
var list = new PieceCollection([
    new Piece(TYPE_ENUM.KING, TURN_ENUM.WHITE, 1, 0),
    new Piece(TYPE_ENUM.QUEEN, TURN_ENUM.WHITE, 0, 0),
    new Piece(TYPE_ENUM.ROCK, TURN_ENUM.WHITE, 1, 1),
    new Piece(TYPE_ENUM.QUEEN, TURN_ENUM.BLACK, 5, 7),
    new Piece(TYPE_ENUM.KING, TURN_ENUM.BLACK, 7, 7),
    new Piece(TYPE_ENUM.BISHOP, TURN_ENUM.WHITE, 5, 5),
    new Piece(TYPE_ENUM.PAWN, TURN_ENUM.WHITE, 0, 1),
    new Piece(TYPE_ENUM.PAWN, TURN_ENUM.BLACK, 0, 6),
    new Piece(TYPE_ENUM.PAWN, TURN_ENUM.BLACK, 1, 4)
]);


var state = new State({});
var presenter = new Presenter(table, list);
presenter.render();

var ctrl = new InputController(table, state);
var validator = new RuleValidator(state, list);
var manager = new TurnManager(state, presenter, validator);
