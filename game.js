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
    this.x = x || 0;
    this.y = y || 0;
    this.isRemoved = false;
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
    if(piece.isRemoved && img.parentNode){
        img.style.display = 'none';
        img.parentNode.removeChild(img);
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

function State(){
    this.selected = false;
    this.turn = TURN_ENUM.WHITE;
    this.dest = false;
}

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
        [TYPE_ENUM.QUEEN, this.queenValidation]
    ]);

    this.mapAttack = new Map([
        [TYPE_ENUM.KING, () => true],
        [TYPE_ENUM.QUEEN, () => true]
    ]);
}

RuleValidator.prototype.queenValidation = function(prev, current){
    var dX = Math.abs(Math.abs(prev.x) - Math.abs(current.x));
    var dY = Math.abs(Math.abs(prev.y) - Math.abs(current.y));

    switch(true){
        case prev.y === current.y:
            for(let i= 1; i<dX-1; i++){
                let point = {
                    y: prev.y,
                    x: current.x - i * (prev.x > current.x ? -1 : 1)
                };
                if(!this.list.isAvailableDest(point)){
                    return false;
                }
            }

            break;
        case prev.x === current.x:
            for(let i= 1; i<dY-1; i++){
                let point = {
                    x: prev.x,
                    y: current.y - i * (prev.y > current.y ? -1 : 1)
                };
                if(!this.list.isAvailableDest(point)){
                    return false;
                }
            }

            break;
        default:
            for(let i= 1; i<dX; i++){
                let point = {
                    x: current.x - i * (prev.x > current.x ? -1 : 1),
                    y: current.y - i * (prev.y > current.y ? -1 : 1)
                };
                if(!this.list.isAvailableDest(point)){
                    return false;
                }
            }
    }

    return true;
};

RuleValidator.prototype.kingValidation = function (prev, current){
    var isValidX = Math.abs(Math.abs(prev.x) - Math.abs(current.x)) <2;
    var isValidY = Math.abs(Math.abs(prev.y) - Math.abs(current.y)) <2;

    return isValidX && isValidY;
};

/**
 *
 * @param {Piece} piece
 * @param {{}} dest
 */
RuleValidator.prototype.checkMove = function(piece, dest){
    return (this.mapMove.get(piece.name) || _.noop).call(this, _.pick(piece, ['x', 'y']), dest);
};

/**
 *
 * @param {Piece} piece
 * @param {{}} dest
 */
RuleValidator.prototype.canAttack = function(piece, dest){
    return (this.mapAttack.get(piece.name) || _.noop).call(this, _.pick(piece, ['x', 'y']), dest);
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

        if(this.state.wasSelected){
            if(!this.state.selected){
                if(wPiece && this.validator.checkMove(wPiece, this.state.dest)){
                    this.actions.move(wPiece);
                    this.switchTurn();
                }
            } else {
                if(wPiece && this.validator.checkMove(wPiece, this.state.dest)){
                    if(this.validator.canAttack(wPiece, this.state.dest)){
                        if(cPiece.color !== wPiece.color){
                            this.actions.kill(wPiece, cPiece);
                            this.switchTurn();
                        }
                    }
                }
            }
        }

        this.presenter.render();
    });
}

TurnManager.prototype.switchTurn = function(){
    this.state.turn = this.ordering.next().value;
};

function ActionManager(state){
    this.state = state;
}

ActionManager.prototype.move = function(piece){
    _.mergeWith(piece, this.state.dest);
};

/**
 * @param {Piece} killer
 * @param {Piece} target
 */
ActionManager.prototype.kill = function(killer, target){
    _.mergeWith(killer, this.state.dest);
    target.isRemoved = true;
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
    return !this.list.reduce((result, piece) => {
        return result || _.isEqual(dest, {
            x: piece.x,
            y: piece.y
        });
    }, false);
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
    //new Piece(TYPE_ENUM.ROCK, TURN_ENUM.WHITE, 0, 1),
    new Piece(TYPE_ENUM.QUEEN, TURN_ENUM.BLACK, 5, 7),
    new Piece(TYPE_ENUM.KING, TURN_ENUM.BLACK, 7, 7),
    new Piece(TYPE_ENUM.BISHOP, TURN_ENUM.BLACK, 5, 5)
]);


var state = new State();
var presenter = new Presenter(table, list);
presenter.render();

var ctrl = new InputController(table, state);
var validator = new RuleValidator(state, list);
var manager = new TurnManager(state, presenter, validator);
