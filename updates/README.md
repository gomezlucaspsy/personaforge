# updates/

Subí acá los pedidos que te arman los agentes desde su **My Computer**
(descargalos con el botón *Download*). Un archivo por pedido, con la fecha:

- `2026-09-29.txt`
- `2026-10-02-privacidad.pdf`

Al pushear a `main`, la Action `updates-to-pr.yml` lee el archivo nuevo,
Claude implementa lo pedido y abre un PR `[updates-bot]` para que CodeRabbit
lo revise y vos lo mergees.

Formato recomendado, un pedido concreto por línea:

```
[ ] Agregar botón para borrar todo el historial del chat
[ ] Mostrar la fecha en cada mensaje
```

Este README no dispara el bot.
