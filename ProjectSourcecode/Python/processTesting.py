import cv2
import numpy as np
import matplotlib.pyplot as plt
from process_to_lines import preprocess_image, segment_lines, segment_characters

def plot_images(images, titles, main_title):
    n = len(images)
    fig, axes = plt.subplots(1, n, figsize=(5*n, 5))
    fig.suptitle(main_title)
    
    if n == 1:
        axes = [axes]
    
    for ax, image, title in zip(axes, images, titles):
        if len(image.shape) == 2:
            ax.imshow(image, cmap='gray')
        else:
            ax.imshow(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        ax.set_title(title)
        ax.axis('off')
    
    plt.tight_layout()
    plt.show()

def test_image_processing(image_path):
    # Step 1: Load and preprocess the image
    binary_image = preprocess_image(image_path)
    print("plotting bin img")
    plot_images([cv2.imread(image_path), binary_image],
                ['Original Image', 'Preprocessed Binary Image'],
                'Preprocessing')

    # Step 2: Segment into lines
    print("calling seglines")
    lines = segment_lines(binary_image)
    print("plotting seglines")
    plot_images(lines, [f'Line {i+1}' for i in range(len(lines))], 'Line Segmentation')

    # Step 3: Segment each line into characters
    for i, line in enumerate(lines):
        print("segmenting character")
        characters = segment_characters(line)
        print("plotting chars")
        plot_images(characters, 
                    [f'Char {j+1}' for j in range(len(characters))],
                    f'Character Segmentation - Line {i+1}')

if __name__ == "__main__":
    # Replace with the path to your test image
    test_image_path = "testimg2.jpg"
    test_image_processing(test_image_path)