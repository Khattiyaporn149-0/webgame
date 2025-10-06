extends CharacterBody2D

@export var speed = 120
@onready var anim = $Animated

func _physics_process(delta):
	var direction = Vector2.ZERO

	if Input.is_action_pressed("ui_right"):
		direction.x += 1
	if Input.is_action_pressed("ui_left"):
		direction.x -= 1
	if Input.is_action_pressed("ui_up"):
		direction.y -= 1
	if Input.is_action_pressed("ui_down"):
		direction.y += 1

	if direction != Vector2.ZERO:
		velocity = direction.normalized() * speed
		anim.play("walk")
	else:
		velocity = Vector2.ZERO
		anim.play("idle")

	move_and_slide()
