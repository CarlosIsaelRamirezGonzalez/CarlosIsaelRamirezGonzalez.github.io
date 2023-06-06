window.addEventListener('DOMContentLoaded', (event) => {
    const letters = document.querySelectorAll('.letter');
  
    letters.forEach((letter) => {
      letter.addEventListener('mouseover', () => {
        letter.style.color = getRandomColor(); // Cambia a un color aleatorio
      });
  
      letter.addEventListener('mouseout', () => {
        letter.style.color = ''; // Restaura el color original
      });
    });
  });
  
  function getRandomColor() {
    const colors = ['red', 'blue', 'green', 'orange', 'purple', 'yellow', 'cyan', 'magenta', 'lime', 'teal', 'indigo', 'violet', 'pink', 'brown', 'gold', 'silver', 'maroon', 'navy', 'turquoise', 'olive', 'salmon', 'coral', 'aqua', 'crimson', 'chocolate', 'tomato', 'firebrick', 'darkslategrey', 'darkorchid', 'deepskyblue', 'dodgerblue', 'forestgreen', 'darkkhaki', 'darkgoldenrod', 'darkolivegreen', 'darkseagreen', 'slateblue', 'springgreen', 'steelblue', 'peru', 'midnightblue', 'lightseagreen', 'lawngreen', 'hotpink', 'darkviolet', 'darkturquoise'];
    const randomIndex = Math.floor(Math.random() * colors.length);
    return colors[randomIndex];
  }
