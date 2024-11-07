import tkinter as tk
from PIL import Image, ImageDraw
import numpy as np
import tensorflow as tf
from process_to_lines import preprocess_char
import csv
import io

class DrawingApp:
    def __init__(self, model_path, symbols_csv_path):
        self.root = tk.Tk()
        self.root.title("Draw Symbol for CNN Testing")
        
        # Load the model and symbols mapping
        self.model = tf.keras.models.load_model(model_path)
        self.symbols_map = self.load_symbols_mapping(symbols_csv_path)
        
        # Canvas setup
        self.canvas_width = 280
        self.canvas_height = 280
        self.canvas = tk.Canvas(self.root, 
                              width=self.canvas_width,
                              height=self.canvas_height,
                              bg='white')
        self.canvas.pack(pady=20)
        
        # Drawing variables
        self.drawing = False
        self.last_x = None
        self.last_y = None
        
        # Buttons
        button_frame = tk.Frame(self.root)
        button_frame.pack(pady=20)
        
        clear_btn = tk.Button(button_frame, text="Clear", command=self.clear_canvas)
        clear_btn.pack(side=tk.LEFT, padx=10)
        
        predict_btn = tk.Button(button_frame, text="Predict", command=self.predict_symbol)
        predict_btn.pack(side=tk.LEFT, padx=10)
        
        # Results label
        self.result_label = tk.Label(self.root, text="Draw a symbol and click Predict",
                                   font=("Arial", 14))
        self.result_label.pack(pady=20)
        
        # Bind mouse events
        self.canvas.bind("<Button-1>", self.start_drawing)
        self.canvas.bind("<B1-Motion>", self.draw)
        self.canvas.bind("<ButtonRelease-1>", self.stop_drawing)
        
    def load_symbols_mapping(self, csv_path):
        symbols = {}
        with open(csv_path, 'r') as file:
            reader = csv.DictReader(file)
            for row in reader:
                symbols[int(row['index'])] = row['latex']
        return symbols
    
    def start_drawing(self, event):
        self.drawing = True
        self.last_x = event.x
        self.last_y = event.y
    
    def draw(self, event):
        if self.drawing:
            self.canvas.create_line(self.last_x, self.last_y,
                                  event.x, event.y,
                                  width=15, fill='black',
                                  capstyle=tk.ROUND, smooth=True)
            self.last_x = event.x
            self.last_y = event.y
    
    def stop_drawing(self, event):
        self.drawing = False
    
    def clear_canvas(self):
        self.canvas.delete("all")
        self.result_label.config(text="Draw a symbol and click Predict")
    
    def predict_symbol(self):
        # Convert canvas to image
        ps = self.canvas.postscript(colormode='gray')
        img = Image.open(io.BytesIO(ps.encode('utf-8')))
        img = img.convert('L')  # Convert to grayscale
        
        # Preprocess the image
        img_array = np.array(img)
        
        # Process the image to lines
        processed_image = preprocess_char(img_array)
        
        # Reshape the image to match the model input shape
        processed_image = processed_image.reshape(1, 28, 28, 1)
        
        # Normalize the image
        processed_image = processed_image / 255.0
        
        # Predict the symbol
        prediction = self.model.predict(processed_image)
        
        # Get the predicted symbol index
        predicted_index = np.argmax(prediction)
        
        # Get the predicted symbol latex
        predicted_symbol = self.symbols_map[predicted_index]
        
        # Update the result label
        self.result_label.config(text=f"Predicted Symbol: {predicted_symbol}")
        
        # Clear the canvas
        self.clear_canvas()
        
        # Draw the predicted symbol
        self.draw_predicted_symbol(predicted_symbol)
    
    def draw_predicted_symbol(self, symbol):
        # Convert the symbol to an image
        img = Image.new('L', (28, 28), 'white')
        draw = ImageDraw.Draw(img)
        draw.text((0, 0), symbol, fill='black', font=ImageFont.load_default())
        
        # Resize the image to match the canvas size
        img = img.resize((self.canvas_width, self.canvas_height), Image.ANTIALIAS)
        
        # Convert the image to a format that can be displayed on the canvas
        img = img.convert('L')
        
        # Draw the image on the canvas
        self.canvas.create_image(self.canvas_width // 2, self.canvas_height // 2,
                                image=tk.PhotoImage(img),
                                anchor=tk.CENTER)
        
        # Update the result label
        self.result_label.config(text=f"Predicted Symbol: {symbol}")
        
        # Clear the canvas
        self.clear_canvas()
        
        # Draw the predicted symbol
        self.draw_predicted_symbol(symbol)
        
app = DrawingApp('path_to_model', 'path_to_symbols_csv')
app.root.mainloop() 