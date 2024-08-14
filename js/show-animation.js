const items = document.querySelectorAll('.animated-item');

const checkItems = () => {
    const triggerBottom = window.innerHeight / 5 * 4.5;

    items.forEach(item => {
        const itemTop = item.getBoundingClientRect().top;

        if(itemTop < triggerBottom) {
            item.classList.add('show');
        } else {
            // item.classList.remove('show');
        }
    });
}

window.addEventListener('scroll', checkItems);

checkItems();